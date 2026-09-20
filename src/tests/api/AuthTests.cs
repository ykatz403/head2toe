using System.Net;
using System.Net.Http.Json;
using Head2Toe.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Head2Toe.Api.Tests;

public class AuthTests(ApiFactory f) : IClassFixture<ApiFactory>
{
    [Fact]
    public async Task Health_is_ok()
    {
        var res = await f.CreateClient().GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Register_returns_a_token_and_the_email()
    {
        var email = ApiFactory.NewEmail();
        var res = await f.CreateClient().PostAsJsonAsync("/api/auth/register", new { email, password = "password123" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = (await res.Content.ReadFromJsonAsync<ApiFactory.Auth>())!;
        Assert.Equal(email, body.Email);
        Assert.False(string.IsNullOrWhiteSpace(body.Token));
        Assert.Equal(3, body.Token.Split('.').Length); // a JWT
    }

    [Fact]
    public async Task Register_twice_with_the_same_email_is_a_conflict()
    {
        var email = ApiFactory.NewEmail();
        var c = f.CreateClient();
        await c.PostAsJsonAsync("/api/auth/register", new { email, password = "password123" });
        var again = await c.PostAsJsonAsync("/api/auth/register", new { email, password = "different456" });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Email_is_case_insensitive_and_trimmed()
    {
        var email = ApiFactory.NewEmail();
        var c = f.CreateClient();
        await c.PostAsJsonAsync("/api/auth/register", new { email = $"  {email.ToUpperInvariant()} ", password = "password123" });
        var login = await c.PostAsJsonAsync("/api/auth/login", new { email, password = "password123" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var dupe = await c.PostAsJsonAsync("/api/auth/register", new { email = email.ToUpperInvariant(), password = "password123" });
        Assert.Equal(HttpStatusCode.Conflict, dupe.StatusCode);
    }

    [Theory]
    [InlineData("", "password123")]
    [InlineData("not-an-email", "password123")]
    [InlineData("a@b.com", "short")]
    [InlineData("a@b.com", "")]
    public async Task Register_rejects_invalid_input(string email, string password)
    {
        var res = await f.CreateClient().PostAsJsonAsync("/api/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Register_rejects_an_absurdly_long_email()
    {
        var res = await f.CreateClient().PostAsJsonAsync("/api/auth/register", new { email = new string('a', 250) + "@x.com", password = "password123" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Register_rejects_a_missing_body_fields()
    {
        var res = await f.CreateClient().PostAsJsonAsync("/api/auth/register", new { });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Login_succeeds_with_correct_password()
    {
        var (_, email) = await f.SignedInClientAsync();
        var res = await f.CreateClient().PostAsJsonAsync("/api/auth/login", new { email, password = "password123" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Wrong_password_and_unknown_email_look_identical()
    {
        var (_, email) = await f.SignedInClientAsync();
        var c = f.CreateClient();
        var wrong = await c.PostAsJsonAsync("/api/auth/login", new { email, password = "nopenope1" });
        var unknown = await c.PostAsJsonAsync("/api/auth/login", new { email = ApiFactory.NewEmail(), password = "nopenope1" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        Assert.Equal(await wrong.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync()); // no account enumeration
    }

    [Fact]
    public async Task Password_is_stored_hashed_never_in_plain_text()
    {
        var (_, email) = await f.SignedInClientAsync(password: "my-secret-pw-1");
        using var scope = f.Services.CreateScope();
        var user = await scope.ServiceProvider.GetRequiredService<AppDb>().Users.SingleAsync(u => u.Email == email);
        Assert.DoesNotContain("my-secret-pw-1", user.PasswordHash);
        Assert.StartsWith("$2", user.PasswordHash); // bcrypt
    }

    [Fact]
    public async Task Sql_injection_in_email_does_not_bypass_login()
    {
        var res = await f.CreateClient().PostAsJsonAsync("/api/auth/login", new { email = "' OR '1'='1", password = "x' OR '1'='1" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Auth_endpoints_are_rate_limited()
    {
        using var limited = new ApiFactory.Limited(3);
        var c = limited.CreateClient();
        var codes = new List<HttpStatusCode>();
        for (var i = 0; i < 6; i++)
            codes.Add((await c.PostAsJsonAsync("/api/auth/login", new { email = "x@y.com", password = "whatever1" })).StatusCode);
        Assert.Equal(3, codes.Count(x => x == HttpStatusCode.Unauthorized));
        Assert.Equal(3, codes.Count(x => x == HttpStatusCode.TooManyRequests));
    }
}
