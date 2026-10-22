import { describe, it, expect } from "bun:test";
import * as searchService from "./search.service";
import { pgPool } from "../../prisma/db";

describe("Zero-Cost Hybrid Wallpaper Search & Relevance Ranking", () => {
  it("exact title matches are ranked at the top with highest score", async () => {
    const res = await searchService.searchContent("Kanagawa great wave", { page: 1, limit: 10 });
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.items[0].title.toLowerCase()).toContain("kanagawa great wave");
    expect(res.items[0].searchScore).toBeGreaterThanOrEqual(50);
    expect(res.items[0].matchReasons).toContain("Exact Title");
  });

  it("typo-tolerant matching discovers wallpapers despite misspellings ('Japnese anime')", async () => {
    const res = await searchService.searchContent("Japnese anime", { page: 1, limit: 10 });
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    const titles = res.items.map((i) => i.title.toLowerCase());
    const hasAnimeMatch = titles.some((t) => t.includes("sukuna") || t.includes("gojo") || t.includes("kanagawa"));
    expect(hasAnimeMatch).toBe(true);
    // Verified match reason or style badge
    expect(res.items[0].matchReasons?.length).toBeGreaterThan(0);
  });

  it("finds wallpapers via mood, visual style, and environment ('blue ocean')", async () => {
    const res = await searchService.searchContent("blue ocean", { page: 1, limit: 10 });
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.items[0].title.toLowerCase()).toContain("kanagawa");
    expect(res.items[0].matchReasons?.some((r: string) => r.includes("Color: Blue") || r.includes("Environment: Ocean"))).toBe(true);
  });

  it("finds wallpapers via complex descriptive queries ('rainy neon city')", async () => {
    const res = await searchService.searchContent("rainy neon city", { page: 1, limit: 10 });
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    const topItem = res.items[0];
    // Matched Pixel lofi city or Miles Morales in city
    expect(
      topItem.title.toLowerCase().includes("pixel") ||
      topItem.title.toLowerCase().includes("miles") ||
      topItem.title.toLowerCase().includes("toyota")
    ).toBe(true);
  });

  it("finds automotive wallpapers via drifting and vehicle synonyms ('drifting car')", async () => {
    const res = await searchService.searchContent("drifting car", { page: 1, limit: 10 });
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.items[0].title.toLowerCase()).toContain("toyota chaser");
  });

  it("handles empty query by returning default discovery feed without failing", async () => {
    const res = await searchService.searchContent("", { page: 1, limit: 5 });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.pagination.total).toBeGreaterThan(0);
    expect(res.items[0].matchReasons).toContain("Discovery");
  });

  it("handles queries with no matches gracefully with zero results and clean pagination", async () => {
    const res = await searchService.searchContent("xyzzynonexistentquery12345", { page: 1, limit: 10 });
    expect(res.items.length).toBe(0);
    expect(res.pagination.total).toBe(0);
  });

  it("paginates candidates consistently without duplicating across pages", async () => {
    const page1 = await searchService.searchContent("", { page: 1, limit: 2 });
    const page2 = await searchService.searchContent("", { page: 2, limit: 2 });

    expect(page1.items.length).toBe(2);
    expect(page2.items.length).toBe(2);
    expect(page1.items[0].id).not.toBe(page2.items[0].id);
  });

  it("never exposes private, deleted, or uncompleted uploads in search results", async () => {
    // We know from db inspection there are private and failed uploads like "Real Supabase Upload Test"
    const res = await searchService.searchContent("Supabase Upload Test", { page: 1, limit: 10 });
    const foundPrivate = res.items.some((i) => i.title.includes("Real Supabase Upload Test") || i.visibility !== "PUBLIC");
    expect(foundPrivate).toBe(false);

    // Verify all returned results are strictly public and completed
    const allSearch = await searchService.searchContent("", { page: 1, limit: 50 });
    for (const item of allSearch.items) {
      expect(item.visibility).toBe("PUBLIC");
      expect(item.processingStatus).toBe("COMPLETED");
      expect(item.isDeleted).toBe(false);
    }
  });

  it("autocomplete suggestions return relevant terms and handle typos", async () => {
    const suggestions1 = await searchService.getSuggestions("anme");
    expect(suggestions1.length).toBeGreaterThanOrEqual(1);
    expect(suggestions1.some((s) => s.toLowerCase().includes("anime"))).toBe(true);

    const suggestions2 = await searchService.getSuggestions("japnese");
    expect(suggestions2.length).toBeGreaterThanOrEqual(1);
    expect(suggestions2.some((s) => s.toLowerCase().includes("japan") || s.toLowerCase().includes("kanagawa"))).toBe(true);
  });
});
