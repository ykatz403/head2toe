using System.Text.Json;

namespace Head2Toe.Api.Data;

/// <summary>Starter catalog. Replaced by affiliate product feeds in production.</summary>
public static class Seed
{
    static readonly Dictionary<string, (string Name, string Url)> Brands = new()
    {
        ["uniqlo"] = ("Uniqlo", "https://www.uniqlo.com"), ["zara"] = ("Zara", "https://www.zara.com"),
        ["cos"] = ("COS", "https://www.cos.com"), ["hm"] = ("H&M", "https://www.hm.com"),
        ["rayban"] = ("Ray-Ban", "https://www.ray-ban.com"), ["persol"] = ("Persol", "https://www.persol.com"),
        ["gucci"] = ("Gucci", "https://www.gucci.com"), ["ferragamo"] = ("Ferragamo", "https://www.ferragamo.com"),
        ["loro"] = ("Loro Piana", "https://www.loropiana.com"), ["cucinelli"] = ("Brunello Cucinelli", "https://www.brunellocucinelli.com"),
        ["nike"] = ("Nike", "https://www.nike.com"), ["sunspel"] = ("Sunspel", "https://www.sunspel.com"),
        ["falke"] = ("Falke", "https://www.falke.com"), ["moncler"] = ("Moncler", "https://www.moncler.com"),
        ["levis"] = ("Levi's", "https://www.levi.com"), ["dr"] = ("Dr. Martens", "https://www.drmartens.com"),
        ["timberland"] = ("Timberland", "https://www.timberland.com"), ["vilebrequin"] = ("Vilebrequin", "https://www.vilebrequin.com"),
        ["speedo"] = ("Speedo", "https://www.speedo.com"), ["birk"] = ("Birkenstock", "https://www.birkenstock.com"),
        ["prada"] = ("Prada", "https://www.prada.com"),
    };

    static Product P(string season, string slot, string brand, string name, decimal price, string color, string tier, object? attrs = null) => new()
    {
        Season = season, Slot = slot, Tier = tier, Brand = Brands[brand].Name, Name = name, Price = price, Color = color,
        Url = Brands[brand].Url, AttrsJson = JsonSerializer.Serialize(attrs ?? new { }),
    };

    public static IEnumerable<Product> Catalog()
    {
        // summer
        yield return P("summer", "hat", "uniqlo", "UV Protection Cap", 19.9m, "#d8d2c4", "std", new { shape = "cap" });
        yield return P("summer", "hat", "zara", "Woven Straw Hat", 29.9m, "#cdb98a", "std", new { shape = "straw" });
        yield return P("summer", "hat", "loro", "Linen Baseball Cap", 520m, "#8a9a8c", "lux", new { shape = "cap" });
        yield return P("summer", "hat", "cucinelli", "Straw Fedora", 640m, "#c9b48a", "lux", new { shape = "straw" });
        yield return P("summer", "glasses", "rayban", "Wayfarer Classic", 163m, "#1a1a1a", "std", new { lens = "#20262b" });
        yield return P("summer", "glasses", "zara", "Metal Aviators", 25.9m, "#c9a24b", "std", new { lens = "#3a4a3a" });
        yield return P("summer", "glasses", "persol", "714 Folding Sunglasses", 360m, "#5a3a24", "lux", new { lens = "#2a2f33" });
        yield return P("summer", "glasses", "gucci", "Square Acetate Sunglasses", 430m, "#111111", "lux", new { lens = "#151515" });
        yield return P("summer", "under", "uniqlo", "AIRism Cotton Crew Tee", 14.9m, "#f2f2f2", "std", new { sleeve = "short" });
        yield return P("summer", "under", "sunspel", "Riviera Cotton Tee", 95m, "#ffffff", "lux", new { sleeve = "short" });
        yield return P("summer", "top", "uniqlo", "Linen Short-Sleeve Shirt", 39.9m, "#9fc0d6", "std", new { sleeve = "short" });
        yield return P("summer", "top", "zara", "Camp Collar Shirt", 45.9m, "#e8e0cf", "std", new { sleeve = "short" });
        yield return P("summer", "top", "cucinelli", "Linen Leisure Shirt", 495m, "#b7c4d0", "lux", new { sleeve = "short" });
        yield return P("summer", "top", "gucci", "Silk Bowling Shirt", 1400m, "#2f5d50", "lux", new { sleeve = "short" });
        yield return P("summer", "pants", "uniqlo", "Linen-Blend Shorts", 29.9m, "#b5a58a", "std", new { len = "short" });
        yield return P("summer", "pants", "zara", "Linen Trousers", 49.9m, "#d6cdb8", "std", new { len = "long" });
        yield return P("summer", "pants", "loro", "Bermuda Shorts", 690m, "#cfc6b5", "lux", new { len = "short" });
        yield return P("summer", "pants", "cucinelli", "Linen Trousers", 790m, "#c2b8a3", "lux", new { len = "long" });
        yield return P("summer", "boxers", "uniqlo", "AIRism Boxer Briefs", 12.9m, "#3b4a5a", "std");
        yield return P("summer", "boxers", "sunspel", "Cotton Boxer", 40m, "#1f2a44", "lux");
        yield return P("summer", "socks", "uniqlo", "No-Show Socks", 7.9m, "#f5f5f5", "std", new { sock = "low" });
        yield return P("summer", "socks", "falke", "Cool Kick Sneaker Socks", 22m, "#e9e9e9", "lux", new { sock = "low" });
        yield return P("summer", "shoes", "nike", "Court Vision Sneaker", 80m, "#f2f2f2", "std", new { type = "sneaker" });
        yield return P("summer", "shoes", "zara", "Leather Loafers", 79.9m, "#6b4a32", "std", new { type = "loafer" });
        yield return P("summer", "shoes", "ferragamo", "Gancini Loafer", 850m, "#3a2a22", "lux", new { type = "loafer" });
        yield return P("summer", "shoes", "gucci", "Ace Sneaker", 780m, "#f4f4f0", "lux", new { type = "sneaker" });

        // winter
        yield return P("winter", "hat", "uniqlo", "HEATTECH Beanie", 14.9m, "#2b2f36", "std", new { shape = "beanie" });
        yield return P("winter", "hat", "zara", "Wool Blend Beanie", 25.9m, "#5c4a3d", "std", new { shape = "beanie" });
        yield return P("winter", "hat", "loro", "Cashmere Beanie", 350m, "#6d5d52", "lux", new { shape = "beanie" });
        yield return P("winter", "hat", "cucinelli", "Cashmere Rib Beanie", 420m, "#3a3f4a", "lux", new { shape = "beanie" });
        yield return P("winter", "under", "uniqlo", "HEATTECH Crew Neck", 19.9m, "#e8e8e8", "std", new { sleeve = "long" });
        yield return P("winter", "under", "sunspel", "Merino Base Layer", 85m, "#dcdcdc", "lux", new { sleeve = "long" });
        yield return P("winter", "top", "uniqlo", "Extra Fine Merino Sweater", 39.9m, "#43506b", "std", new { sleeve = "long" });
        yield return P("winter", "top", "cos", "Wool Knit Jumper", 89m, "#5c5f56", "std", new { sleeve = "long" });
        yield return P("winter", "top", "cucinelli", "Cashmere Crewneck", 1295m, "#8b6f5a", "lux", new { sleeve = "long" });
        yield return P("winter", "top", "gucci", "Wool Knit Sweater", 1100m, "#1f3b2d", "lux", new { sleeve = "long" });
        yield return P("winter", "outer", "uniqlo", "Ultra Light Down Jacket", 89.9m, "#1c2027", "std", new { coat = false });
        yield return P("winter", "outer", "zara", "Wool Blend Coat", 199m, "#6b6f74", "std", new { coat = true });
        yield return P("winter", "outer", "moncler", "Down Jacket", 1500m, "#1a1d24", "lux", new { coat = false });
        yield return P("winter", "outer", "loro", "Storm System Coat", 3800m, "#3b4252", "lux", new { coat = true });
        yield return P("winter", "pants", "uniqlo", "Wool-Blend Trousers", 49.9m, "#2d3038", "std", new { len = "long" });
        yield return P("winter", "pants", "levis", "501 Original Jeans", 79.5m, "#2a3f66", "std", new { len = "long" });
        yield return P("winter", "pants", "cucinelli", "Flannel Trousers", 750m, "#55575c", "lux", new { len = "long" });
        yield return P("winter", "pants", "gucci", "Wool Trousers", 950m, "#26282c", "lux", new { len = "long" });
        yield return P("winter", "boxers", "uniqlo", "HEATTECH Boxer Briefs", 12.9m, "#2f3742", "std");
        yield return P("winter", "boxers", "sunspel", "Merino Boxer", 55m, "#2a2f3a", "lux");
        yield return P("winter", "socks", "uniqlo", "HEATTECH Socks", 9.9m, "#444a52", "std", new { sock = "crew" });
        yield return P("winter", "socks", "falke", "Wool Crew Socks", 25m, "#3c3f47", "lux", new { sock = "crew" });
        yield return P("winter", "shoes", "dr", "1460 Boot", 170m, "#1e1a18", "std", new { type = "boot" });
        yield return P("winter", "shoes", "timberland", "6-Inch Boot", 198m, "#b58a4a", "std", new { type = "boot" });
        yield return P("winter", "shoes", "ferragamo", "Leather Chelsea Boot", 950m, "#2b201b", "lux", new { type = "boot" });
        yield return P("winter", "shoes", "gucci", "Leather Ankle Boot", 1200m, "#16130f", "lux", new { type = "boot" });

        // pool
        yield return P("pool", "hat", "zara", "Straw Hat", 29.9m, "#cdb98a", "std", new { shape = "straw" });
        yield return P("pool", "hat", "hm", "Bucket Hat", 18m, "#e6dfc8", "std", new { shape = "cap" });
        yield return P("pool", "hat", "loro", "Summer Straw Hat", 620m, "#d1bf94", "lux", new { shape = "straw" });
        yield return P("pool", "hat", "prada", "Re-Nylon Bucket Hat", 690m, "#101010", "lux", new { shape = "cap" });
        yield return P("pool", "glasses", "rayban", "Aviator Classic", 163m, "#c9a24b", "std", new { lens = "#2f3a2f" });
        yield return P("pool", "glasses", "zara", "Round Sunglasses", 25.9m, "#222222", "std", new { lens = "#1a1a1a" });
        yield return P("pool", "glasses", "persol", "649 Sunglasses", 340m, "#7a4a24", "lux", new { lens = "#2a2f33" });
        yield return P("pool", "glasses", "gucci", "Round Sunglasses", 450m, "#8a5a2b", "lux", new { lens = "#3b2a1a" });
        yield return P("pool", "top", "uniqlo", "Open-Collar Linen Shirt", 34.9m, "#f0f0f0", "std", new { sleeve = "short" });
        yield return P("pool", "top", "zara", "Resort Shirt", 39.9m, "#8fb8c9", "std", new { sleeve = "short" });
        yield return P("pool", "top", "vilebrequin", "Linen Beach Shirt", 220m, "#e4e9ee", "lux", new { sleeve = "short" });
        yield return P("pool", "top", "gucci", "Silk Resort Shirt", 1100m, "#2c6f7d", "lux", new { sleeve = "short" });
        yield return P("pool", "pants", "speedo", "Essential Watershorts", 40m, "#1c4f8a", "std", new { len = "short" });
        yield return P("pool", "pants", "hm", "Swim Shorts", 20m, "#d05a4a", "std", new { len = "short" });
        yield return P("pool", "pants", "vilebrequin", "Moorea Swim Trunks", 245m, "#e17b3d", "lux", new { len = "short" });
        yield return P("pool", "pants", "gucci", "Swim Shorts", 690m, "#12503f", "lux", new { len = "short" });
        yield return P("pool", "shoes", "birk", "Arizona Sandal", 110m, "#b08a5a", "std", new { type = "slide" });
        yield return P("pool", "shoes", "nike", "Victori One Slide", 30m, "#111111", "std", new { type = "slide" });
        yield return P("pool", "shoes", "gucci", "Rubber Slide", 590m, "#1d1d1d", "lux", new { type = "slide" });
        yield return P("pool", "shoes", "prada", "Foam Slide", 550m, "#d5d0c4", "lux", new { type = "slide" });
    }
}
