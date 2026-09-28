using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Head2Toe.Api.Data;
using Head2Toe.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

EnvFile.Load(Path.Combine(Directory.GetCurrentDirectory(), ".env"));

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();
// FASHN_API_TOKEN is the name used in setup instructions, which doesn't match the Fashn__ApiToken
// convention AddEnvironmentVariables expects, so it's bridged in explicitly.
if (Environment.GetEnvironmentVariable("FASHN_API_TOKEN") is { Length: > 0 } fashnToken)
    builder.Configuration["Fashn:ApiToken"] = fashnToken;

var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not set.");
if (!builder.Environment.IsDevelopment() && jwtKey.StartsWith("DEV-ONLY"))
    throw new InvalidOperationException("Set a real Jwt__Key (32+ random bytes) outside Development.");
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
const string Issuer = "head2toe", Audience = "head2toe-web";

builder.Services.AddDbContext<AppDb>(o => o.UseSqlite(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = Issuer,
        ValidateAudience = true, ValidAudience = Audience,
        ValidateIssuerSigningKey = true, IssuerSigningKey = signingKey,
        ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(1),
    };
});
builder.Services.AddAuthorization();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Configuration.GetValue("RateLimit:AuthPerMinute", 10), Window = TimeSpan.FromMinutes(1) }));
    // Each try-on call costs real money on FASHN, so this is capped far tighter than a normal API route.
    o.AddPolicy("tryon", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = builder.Configuration.GetValue("RateLimit:TryOnPerMinute", 4), Window = TimeSpan.FromMinutes(1) }));
});
builder.Services.AddHttpClient<FashnTryOn>(c => c.Timeout = TimeSpan.FromSeconds(100));
// Photos travel as base64 JSON; give the request body enough room for two photos plus JSON overhead.
builder.Services.Configure<Microsoft.AspNetCore.Server.Kestrel.Core.KestrelServerOptions>(o => o.Limits.MaxRequestBodySize = 30 * 1024 * 1024);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();
    if (!db.Products.Any())
    {
        db.Products.AddRange(Seed.Catalog());
        db.SaveChanges();
    }
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseDefaultFiles();
var mime = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
mime.Mappings[".task"] = "application/octet-stream"; // MediaPipe pose model, unknown to ASP.NET by default
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = mime });

string CreateToken(User u) => new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
{
    Issuer = Issuer, Audience = Audience,
    Subject = new ClaimsIdentity([new Claim("sub", u.Id.ToString()), new Claim("email", u.Email)]),
    Expires = DateTime.UtcNow.AddDays(14),
    SigningCredentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256),
});
int UserId(ClaimsPrincipal p) => int.Parse(p.FindFirstValue("sub")!);

var api = app.MapGroup("/api");
api.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// ---- auth ----
var auth = api.MapGroup("/auth").RequireRateLimiting("auth");
auth.MapPost("/register", async (Credentials c, AppDb db) =>
{
    var email = c.Email?.Trim().ToLowerInvariant() ?? "";
    if (!email.Contains('@') || email.Length > 200) return Results.BadRequest(new { error = "Enter a valid email address." });
    if ((c.Password?.Length ?? 0) < 8) return Results.BadRequest(new { error = "Password must be at least 8 characters." });
    if (await db.Users.AnyAsync(u => u.Email == email)) return Results.Conflict(new { error = "An account with this email already exists." });
    var user = new User { Email = email, PasswordHash = BCrypt.Net.BCrypt.HashPassword(c.Password) };
    db.Users.Add(user);
    await db.SaveChangesAsync();
    return Results.Ok(new AuthResponse(CreateToken(user), user.Email));
});
auth.MapPost("/login", async (Credentials c, AppDb db) =>
{
    var email = c.Email?.Trim().ToLowerInvariant() ?? "";
    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
    if (user is null || !BCrypt.Net.BCrypt.Verify(c.Password ?? "", user.PasswordHash))
        return Results.Json(new { error = "Email or password is incorrect." }, statusCode: 401);
    return Results.Ok(new AuthResponse(CreateToken(user), user.Email));
});

// ---- scan (one per user, saved) ----
var scan = api.MapGroup("/scan").RequireAuthorization();
scan.MapGet("", async (ClaimsPrincipal p, AppDb db) =>
{
    var uid = UserId(p);
    var s = await db.Scans.FirstOrDefaultAsync(x => x.UserId == uid);
    return s is null ? Results.NoContent() : Results.Ok(new ScanDto(s.HeightCm, s.BuildPct, s.SkinTone, s.CreatedAt));
});
scan.MapPut("", async (ScanInput i, ClaimsPrincipal p, AppDb db) =>
{
    if (i.HeightCm is < 120 or > 220) return Results.BadRequest(new { error = "Height must be between 120 and 220 cm." });
    if (i.BuildPct is < 85 or > 125) return Results.BadRequest(new { error = "Build must be between 85 and 125." });
    if (i.SkinTone is < 0 or > 4) return Results.BadRequest(new { error = "Skin tone must be between 0 and 4." });
    var uid = UserId(p);
    var s = await db.Scans.FirstOrDefaultAsync(x => x.UserId == uid);
    if (s is null) db.Scans.Add(s = new BodyScan { UserId = uid });
    s.HeightCm = i.HeightCm; s.BuildPct = i.BuildPct; s.SkinTone = i.SkinTone; s.CreatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(new ScanDto(s.HeightCm, s.BuildPct, s.SkinTone, s.CreatedAt));
});
scan.MapDelete("", async (ClaimsPrincipal p, AppDb db) =>
{
    var uid = UserId(p);
    await db.Scans.Where(x => x.UserId == uid).ExecuteDeleteAsync();
    return Results.NoContent();
});

// ---- catalog and outfits ----
api.MapGet("/outfit", async (string? season, string? tier, int? seed, AppDb db) =>
{
    season ??= "summer"; tier ??= "both";
    if (!OutfitEngine.Seasons.Contains(season)) return Results.BadRequest(new { error = "season must be summer, winter or pool." });
    if (!OutfitEngine.Tiers.Contains(tier)) return Results.BadRequest(new { error = "tier must be lux, std or both." });
    var products = await db.Products.AsNoTracking().Where(p => p.Season == season).ToListAsync();
    return Results.Ok(OutfitEngine.Build(products, season, tier, seed ?? 0));
});

// ---- affiliate click tracking: /go/{id} logs the click, then redirects to the retailer ----
app.MapGet("/go/{id:int}", async (int id, HttpContext ctx, AppDb db) =>
{
    var p = await db.Products.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
    if (p is null) return Results.NotFound();
    db.Clicks.Add(new ClickEvent { ProductId = id, Referrer = ctx.Request.Headers.Referer.ToString() is { Length: > 0 } r ? r[..Math.Min(r.Length, 300)] : null });
    await db.SaveChangesAsync();
    return Results.Redirect(p.Url);
});

// ---- real photo try-on: your photo + one garment photo -> a real AI-generated composite ----
// Stateless by design: every call sends the person's photo again, since the model has no memory between calls.
var tryon = api.MapGroup("/tryon").RequireRateLimiting("tryon");
tryon.MapGet("/status", (FashnTryOn r) => Results.Ok(new { configured = r.Configured }));
tryon.MapPost("", async (TryOnRequest req, FashnTryOn r, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(req.HumanImage) || string.IsNullOrWhiteSpace(req.GarmentImage))
        return Results.BadRequest(new { error = "Both a photo of you and a photo of the garment are required." });
    var result = await r.GenerateAsync(req, ct);
    return result.ImageUrl is not null ? Results.Ok(new { imageUrl = result.ImageUrl }) : Results.UnprocessableEntity(new { error = result.Error });
});

// Unknown API routes are real 404s (JSON), never the web page. Everything else falls back to the React app.
app.MapFallback("/api/{**path}", () => Results.NotFound(new { error = "Not found." }));
app.MapFallbackToFile("index.html");
app.Run();

record Credentials(string? Email, string? Password);
record AuthResponse(string Token, string Email);
record ScanInput(int HeightCm, int BuildPct, int SkinTone);
record ScanDto(int HeightCm, int BuildPct, int SkinTone, DateTime CreatedAt);

public partial class Program;
