const mangayomiSources = [
  {
    name: "Comix",
    id: 2847361951,
    baseUrl: "https://comix.to",
    lang: "en",
    typeSource: "single",
    iconUrl: "https://www.google.com/s2/favicons?sz=256&domain=comix.to",
    dateFormat: "",
    dateFormatLocale: "",
    isNsfw: false,
    hasCloudflare: false,
    sourceCodeUrl: "",
    apiUrl: "https://comix-api.vercel.app/api/manga",
    version: "0.1.2",
    isManga: true,
    itemType: 0,
    isFullData: false,
    appMinVerReq: "0.5.0",
    additionalParams: "",
    sourceCodeLanguage: 1,
    notes: "",
    pkgPath: "manga/src/en/comix.js"
  }
];

class DefaultExtension extends MProvider {
  constructor() {
    super();
    this.client = new Client();
  }

  getBaseUrl() {
    return this.source.baseUrl;
  }

  getHeaders() {
    return {
      "User-Agent": "Mangayomi",
      "Accept": "application/json"
    };
  }

  getApiUrl() {
    return "https://comix-api.vercel.app/api/manga";
  }

  async request(path) {
    const res = await this.client.get(this.getApiUrl() + path);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error("Comix API request failed: " + res.statusCode);
    }
    return JSON.parse(res.body);
  }

  makeItem(item) {
    const id = item.id || item.slug;
    const title = item.title || item.name || "";
    const imageUrl = item.img || item.cover || item.image || "";
    return {
      name: title,
      url: id,
      link: this.getBaseUrl() + "/title/" + id,
      imageUrl: imageUrl
    };
  }

  async getPopular(page) {
    if (page > 1) {
      return this.browse(page, "popular");
    }

    const data = await this.request("/home?sfw=true");
    const list = (data.popular || []).map(x => this.makeItem(x));
    return { list, hasNextPage: false };
  }

  async getLatestUpdates(page) {
    if (page > 1) {
      return this.browse(page, "latest");
    }

    const data = await this.request("/home?sfw=true");
    const list = (data.latest || []).map(x => this.makeItem(x));
    return { list, hasNextPage: false };
  }

  async browse(page, mode) {
    const sort = mode === "popular" ? "score:desc" : "chapter_updated_at:desc";
    const path = "/browse?page=" + page + "&limit=30&sort=" + encodeURIComponent(sort) + "&sfw=true";
    const data = await this.request(path);
    const results = data.results || data.items || [];
    const list = results.map(x => this.makeItem(x));
    const pagination = data.pagination || {};
    const current = pagination.current_page || page;
    const last = pagination.last_page || current;
    return { list, hasNextPage: current < last };
  }

  async search(query, page, filters) {
    const path = "/search?q=" + encodeURIComponent(query) + "&page=" + page + "&limit=30&sfw=true";
    const data = await this.request(path);
    const results = data.results || data.items || [];
    const list = results.map(x => this.makeItem(x));
    const pagination = data.pagination || {};
    const current = pagination.current_page || page;
    const last = pagination.last_page || current;
    return { list, hasNextPage: current < last };
  }

  async getDetail(url) {
    let id = url;
    if (url.includes("/title/")) {
      id = url.split("/title/")[1].split("/")[0];
    }

    const data = await this.request("/" + encodeURIComponent(id));
    const comic = data.comic || data.manga || data;

    const chapters = [];
    let page = 1;
    let keepGoing = true;

    while (keepGoing && page <= 100) {
      const chapterData = await this.request(
        "/" + encodeURIComponent(id) + "/chapters?page=" + page + "&limit=100"
      );

      const items = chapterData.chapters || chapterData.results || chapterData.items || [];
      for (const item of items) {
        const chapterId = String(item.id || item.chapter_id || "");
        if (!chapterId) continue;

        const number = item.number ?? item.chapter_number ?? "";
        const title = item.title || item.name || "";
        let name = number !== "" ? "Chapter " + number : "Chapter";
        if (title && title !== String(number)) name += ": " + title;

        let dateUpload = null;
        const rawDate = item.created_at || item.updated_at || item.release_date;
        if (rawDate) {
          const parsed = Date.parse(rawDate);
          if (!isNaN(parsed)) dateUpload = parsed;
        }

        chapters.push({
          name: name,
          url: chapterId,
          scanlator: item.scanlation_group?.name || item.scanlation_group_name || "",
          dateUpload: dateUpload === null ? null : String(dateUpload)
        });
      }

      const pagination = chapterData.pagination || {};
      const current = pagination.current_page || page;
      const last = pagination.last_page || current;
      keepGoing = current < last && items.length > 0;
      page++;
    }

    return {
      link: this.getBaseUrl() + "/title/" + id,
      title: comic.title || "",
      description: comic.synopsis || comic.description || "",
      author: comic.authors || comic.author || "",
      artist: comic.artists || comic.artist || "",
      genre: comic.genres || [],
      status: this.statusCode(comic.status),
      chapters: chapters
    };
  }

  statusCode(status) {
    const value = String(status || "").toLowerCase();
    if (value === "releasing" || value === "ongoing") return 0;
    if (value === "finished" || value === "completed" || value === "complete") return 1;
    if (value === "hiatus") return 2;
    if (value === "canceled" || value === "cancelled") return 3;
    if (value === "publishing_finished") return 4;
    return 5;
  }

  async getPageList(url) {
    const chapterId = String(url).split("/").pop();
    const data = await this.client.get(
      this.getApiUrl().replace(/\/api\/manga$/, "/api/manga/read") +
      "?chapterId=" + encodeURIComponent(chapterId),
      this.getHeaders()
    );

    if (data.statusCode < 200 || data.statusCode >= 300) {
      throw new Error("Comix reader request failed: " + data.statusCode);
    }

    const json = JSON.parse(data.body);
    const images = json.images || json.pages || [];

    return images
      .map(item => {
        let imageUrl = typeof item === "string" ? item : item.url;
        if (!imageUrl) return null;
        if (imageUrl.startsWith("/")) imageUrl = "https://comix-api.vercel.app" + imageUrl;
        return { url: imageUrl, headers: this.getHeaders() };
      })
      .filter(Boolean);
  }

  getFilterList() {
    throw new Error("getFilterList not implemented");
  }
}
