import { NextRequest, NextResponse } from "next/server";

const TMDB_API_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2ZWFjNjM1ODA4YmRjMDJkZjI2ZDMwMjk0MGI0Y2EzNyIsIm5iZiI6MTc0ODY4NTIxNy43Mjg5OTk5LCJzdWIiOiI2ODNhZDFhMTkyMWI4N2IxYzk1Mzc4ODQiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.w-oWdRIxwlXKTpP42Yo87Mld5sqp8uNFpDHgrqB6a3U";

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
  type: number = 1,
  tmdb_id: string
) {
  const year = release_date ? String(release_date).split("-")[0] : "";
  const safeTitle = encodeURIComponent(title || "");
  const apiParam = api ? `&api=${encodeURIComponent(api)}` : "";
  return `https://showbox-five.vercel.app/api/scrape?title=${safeTitle}&year=${year}&rt=${runtime || 0}&type=${type}${apiParam}&tmdbId=${tmdb_id}`;
}

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
        // failed to parse
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
      type === 2 ? 2 : 1,
      tmdb
    );
    const json = await fetchShowboxJson(showbox_link, 30000, false);

    if (!json) {
      return NextResponse.json(
        { error: "Failed to retrieve showbox JSON" },
        { status: 502 }
      );
    }

    const qualitiesPerServer: Record<string, any> = {};
    let defaultLink: string | null = null;

    if (type === 2) {
      const s = Number(searchParams.get("s") || searchParams.get("season") || 1);
      const e = Number(searchParams.get("e") || searchParams.get("episode") || 1);
      const seasons = Array.isArray(json.seasons) ? json.seasons : [];
      const seasonObj = seasons.find((sea: any) => Number(sea.season_number) === s) || seasons[0];
      const eps = seasonObj && Array.isArray(seasonObj.episodes) ? seasonObj.episodes : [];
      
      const parseEpisodeNum = (val: any) => {
        if (val == null) return null;
        if (typeof val === "number") return val;
        const m = String(val).match(/e(\d+)/i);
        return m ? Number(m[1]) : Number(val);
      };

      const episodeObj = eps.find((ep: any) => parseEpisodeNum(ep.episode) === e) || eps[0];
      const links = episodeObj && Array.isArray(episodeObj.links) ? episodeObj.links : [];
      const server = "showbox";
      
      qualitiesPerServer[server] = links
        .filter((item: any) => item && item.link)
        .map((item: any) => ({ quality: item.quality, link: item.link }));
      
      if (qualitiesPerServer[server].length === 0) delete qualitiesPerServer[server];
    } else {
      Object.keys(json).forEach((server) => {
        const arr = Array.isArray(json[server]) ? json[server] : [];
        qualitiesPerServer[server] = arr
          .filter((item: any) => item && item.link)
          .map((item: any) => ({ quality: item.quality, link: item.link }));
        
        if (qualitiesPerServer[server].length === 0) delete qualitiesPerServer[server];
      });
    }

    // Determine default link
    const servers = Object.keys(qualitiesPerServer);

    // Priority 1: 1080p
    for (const srv of servers) {
      const found = qualitiesPerServer[srv].find((q: any) => String(q.quality).toUpperCase().includes("1080"));
      if (found?.link) {
        defaultLink = found.link;
        break;
      }
    }

    // Priority 2: Fallback to any lower quality (highest available below 1080)
    if (!defaultLink) {
      let bestLower: { val: number; link: string } | null = null;
      for (const srv of servers) {
        for (const item of qualitiesPerServer[srv]) {
          const match = String(item.quality).match(/\d+/);
          if (match) {
            const val = parseInt(match[0]);
            if (val < 1080) {
              if (!bestLower || val > bestLower.val) {
                bestLower = { val, link: item.link };
              }
            }
          }
        }
      }
      if (bestLower) defaultLink = bestLower.link;
    }

    // Priority 3: Fallback to ORG
    if (!defaultLink) {
      for (const srv of servers) {
        const found = qualitiesPerServer[srv].find((q: any) => String(q.quality).toUpperCase() === "ORG");
        if (found?.link) {
          defaultLink = found.link;
          break;
        }
      }
    }

    // Priority 4: Final fallback (first available link)
    if (!defaultLink) {
      for (const srv of servers) {
        if (qualitiesPerServer[srv].length > 0) {
          defaultLink = qualitiesPerServer[srv][0].link;
          break;
        }
      }
    }

    // Fetch subtitles from Wyzie
    let subtitles: any[] = [];
    try {
      // Base search URL
      let subUrl = `https://sub.wyzie.io/search?id=${tmdb}&key=wyzie-c69aa3331b319bc85629e700f24fae7a`;
      if (type === 2) {
        const s = searchParams.get("s") || searchParams.get("season") || 1;
        const e = searchParams.get("e") || searchParams.get("episode") || 1;
        subUrl += `&season=${s}&episode=${e}`;
      }
      
      const subRes = await fetch(subUrl);
      if (subRes.ok) {
        const rawSubs = await subRes.json();
        if (Array.isArray(rawSubs)) {
          subtitles = rawSubs.map((sub: any) => {
            let url = sub.url || "";
            // Ensure SSA format for the player
            if (url.includes("sub.wyzie")) {
              if (url.includes("format=srt")) {
                url = url.replace("format=srt", "format=ssa");
              } else if (!url.includes("format=")) {
                const sep = url.includes("?") ? "&" : "?";
                url += `${sep}format=ssa&encoding=UTF-8`;
              }
            }
            return {
              url,
              language: sub.language || "Unknown",
              display: sub.display || sub.language || "Subtitle",
              flagUrl: sub.flagUrl,
            };
          });
        }
      }
    } catch {
      // ignore
    }

    if (subtitles.length > 0) {
      qualitiesPerServer.subtitles = subtitles;
    }

    if (searchParams.get("android") === "true") {
      const allLinks: any[] = [];
      Object.keys(qualitiesPerServer).forEach((server) => {
        if (server === "subtitles") return;
        const arr = qualitiesPerServer[server];
        if (Array.isArray(arr)) {
          arr.forEach((q: any) => {
            allLinks.push({ ...q, server });
          });
        }
      });
      return NextResponse.json({
        title,
        links: allLinks,
        subtitles,
      });
    }

    return NextResponse.json({
      title,
      defaultLink,
      qualities: qualitiesPerServer,
      subtitles,
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: err.status || 500 }
    );
  }
}
