import { NextRequest, NextResponse } from "next/server";

const TMDB_API_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2ZWFjNjM1ODA4YmRjMDJkZjI2ZDMwMjk0MGI0Y2EzNyIsIm5iZiI6MTc0ODY4NTIxNy43Mjg5OTk5LCJzdWIiOiI2ODNhZDFhMTkyMWI4N2IxYzk1Mzc4ODQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.w-oWdRIxwlXKTpP42Yo87Mld5sqp8uNFpDHgrqB6a3U";

async function fetchSubtitles(
  tmdbId: string,
  season?: number,
  episode?: number
) {
  try {
    const url = `https://sub.wyzie.ru/search?id=${tmdbId}&season=${season || 0}&episode=${episode || 0}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const subtitles = await response.json();
    return subtitles.map(
      (sub: { url: string; language: string; display: string }) => ({
        url: sub.url,
        language: sub.language,
        display: sub.display,
      })
    );
  } catch {
    return [];
  }
}

async function getMovieData(tmdb_id: string) {
  const url = `https://api.themoviedb.org/3/movie/${tmdb_id}?language=en-US`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${TMDB_API_TOKEN}`,
    },
  });
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
}

async function getTvData(tmdb_id: string) {
  const url = `https://api.themoviedb.org/3/tv/${tmdb_id}?language=en-US`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${TMDB_API_TOKEN}`,
    },
  });
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
}

function constructShowboxLink(
  title: string,
  runtime: number,
  release_date: string,
  api: string,
  type: number = 1
) {
  const year = release_date ? String(release_date).split("-")[0] : "";
  const safeTitle = encodeURIComponent(title || "");
  const apiParam = api ? `&api=${encodeURIComponent(api)}` : "";
  return `https://showbox-five.vercel.app/api/scrape?title=${safeTitle}&year=${year}&rt=${runtime || 0}&type=${type}${apiParam}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hasAnyLink(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  for (const k of Object.keys(obj)) {
    const arr = Array.isArray(obj[k]) ? obj[k] : [];
    for (const item of arr) {
      if (item && item.link) return true;
    }
  }
  return false;
}

async function fetchShowboxJson(
  url: string,
  timeout = 30000,
  requireLink = true
) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(t);
    }

    if (res && res.ok) {
      try {
        const json = await res.json();
        if (!requireLink || hasAnyLink(json)) return json;
      } catch {
        // not JSON
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdb =
    searchParams.get("tmdb") ||
    searchParams.get("id") ||
    searchParams.get("movie") ||
    "";
  if (!tmdb)
    return NextResponse.json(
      { error: "Missing tmdb query parameter" },
      { status: 400 }
    );

  try {
    const type = Number(searchParams.get("type") || 1);
    const api = searchParams.get("api") || "";
    let title = "";
    let runtime = 0;
    let release_date = "";

    if (type === 2) {
      const tv = await getTvData(String(tmdb));
      title = tv.name || tv.original_name || "";
      const ert = Array.isArray(tv.episode_run_time)
        ? tv.episode_run_time[0]
        : tv.episode_run_time;
      runtime = typeof ert === "number" ? ert : 0;
      release_date = tv.first_air_date || "";
    } else {
      const movie = await getMovieData(String(tmdb));
      title = movie.title || movie.original_title || "";
      runtime = typeof movie.runtime === "number" ? movie.runtime : 0;
      release_date = movie.release_date || "";
    }

    const showbox_link = constructShowboxLink(
      title,
      runtime,
      release_date,
      api,
      type === 2 ? 2 : 1
    );
    const json = await fetchShowboxJson(showbox_link, 30000, false);

    if (!json) {
      return NextResponse.json(
        { error: "Failed to retrieve showbox JSON" },
        { status: 502 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qualitiesPerServer: Record<string, any> = {};
    let defaultLink: string | null = null;

    if (type === 2) {
      const s = Number(searchParams.get("s") || searchParams.get("season") || 1);
      const e = Number(searchParams.get("e") || searchParams.get("episode") || 1);
      const seasons = Array.isArray(json.seasons) ? json.seasons : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const seasonObj = seasons.find((sea: any) => Number(sea.season_number) === s) || seasons[0];
      const eps = seasonObj && Array.isArray(seasonObj.episodes) ? seasonObj.episodes : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parseEpisodeNum = (val: any) => {
        if (val == null) return null;
        if (typeof val === "number") return val;
        const m = String(val).match(/e(\d+)/i);
        return m ? Number(m[1]) : Number(val);
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const episodeObj = eps.find((ep: any) => parseEpisodeNum(ep.episode) === e) || eps[0];
      const links = episodeObj && Array.isArray(episodeObj.links) ? episodeObj.links : [];
      const server = "showbox";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      qualitiesPerServer[server] = links.filter((item: any) => item && item.link).map((item: any) => ({ quality: item.quality, link: item.link }));
      if (qualitiesPerServer[server].length === 0) delete qualitiesPerServer[server];
      const subs = await fetchSubtitles(tmdb, s, e);

      const findDefault = () => {
        const list = qualitiesPerServer[server] || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let f = list.find((q: any) => String(q.quality).toUpperCase() === "ORG");
        if (f && f.link) return f.link;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        f = list.find((q: any) => String(q.quality).toUpperCase().includes("1080"));
        if (f && f.link) return f.link;
        return list.length ? list[0].link : null;
      };
      defaultLink = findDefault();
      if (subs.length > 0) qualitiesPerServer.subtitles = subs;
    } else {
      Object.keys(json).forEach((server) => {
        const arr = Array.isArray(json[server]) ? json[server] : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        qualitiesPerServer[server] = arr.filter((item: any) => item && item.link).map((item: any) => ({ quality: item.quality, link: item.link }));
        if (qualitiesPerServer[server].length === 0)
          delete qualitiesPerServer[server];
      });

      for (const server of Object.keys(qualitiesPerServer)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const found = qualitiesPerServer[server].find((q: any) => String(q.quality).toUpperCase() === "ORG");
        if (found && found.link) {
          defaultLink = found.link;
          break;
        }
      }
      if (!defaultLink) {
        for (const server of Object.keys(qualitiesPerServer)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const found = qualitiesPerServer[server].find((q: any) => String(q.quality).toUpperCase().includes("1080"));
          if (found && found.link) {
            defaultLink = found.link;
            break;
          }
        }
      }
      if (!defaultLink) {
        outer: for (const server of Object.keys(qualitiesPerServer)) {
          for (const q of qualitiesPerServer[server]) {
            if (q.link) {
              defaultLink = q.link;
              break outer;
            }
          }
        }
      }
    }

    // Fetch subtitles from secondary source
    let subtitles: { url: string; language: string; display: string }[] = [];
    try {
      let subUrl = `https://madplay.site/api/subtitle?id=${tmdb}`;
      if (type === 2) {
        const s = searchParams.get("s") || searchParams.get("season") || 1;
        const e = searchParams.get("e") || searchParams.get("episode") || 1;
        subUrl = `https://madplay.site/api/subtitle?id=${tmdb}&season=${s}&episode=${e}`;
      }
      const subRes = await fetch(subUrl);
      if (subRes.ok) subtitles = await subRes.json();
    } catch {
      // ignore
    }

    return NextResponse.json({
      title,
      defaultLink,
      qualities: qualitiesPerServer,
      subtitles,
    });
  } catch (e) {
    const err = e as Error & { status?: number; body?: string };
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: err.status || 500 }
    );
  }
}
