using Microsoft.EntityFrameworkCore;

namespace Head2Toe.Api.Data;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public BodyScan? Scan { get; set; }
}

/// <summary>
/// The saved result of a one-time body scan. Only derived measurements are stored, never the photos.
/// </summary>
public class BodyScan
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int HeightCm { get; set; }
    public int BuildPct { get; set; }
    public int SkinTone { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Product
{
    public int Id { get; set; }
    public string Season { get; set; } = "";   // summer | winter | pool
    public string Slot { get; set; } = "";     // hat | glasses | under | top | outer | pants | boxers | socks | shoes
    public string Tier { get; set; } = "";     // lux | std
    public string Brand { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public string Color { get; set; } = "";
    public string Url { get; set; } = "";      // retailer URL. Becomes an affiliate deep link once feeds are wired in.
    public string AttrsJson { get; set; } = "{}"; // model hints for the 3D avatar (shape, sleeve, len, ...)
}

public class ClickEvent
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
    public string? Referrer { get; set; }
}

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<BodyScan> Scans => Set<BodyScan>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ClickEvent> Clicks => Set<ClickEvent>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>().HasIndex(u => u.Email).IsUnique();
        b.Entity<User>().HasOne(u => u.Scan).WithOne().HasForeignKey<BodyScan>(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Product>().HasIndex(p => new { p.Season, p.Slot });
        b.Entity<Product>().Property(p => p.Price).HasPrecision(10, 2);
    }
}
