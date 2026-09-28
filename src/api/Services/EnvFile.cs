namespace Head2Toe.Api.Services;

/// <summary>
/// Loads KEY=VALUE pairs from a local .env file into the process environment, for secrets kept out of
/// git and out of appsettings.json. Silently does nothing if the file is absent. Development convenience only:
/// production should set real environment variables through the host instead.
/// </summary>
public static class EnvFile
{
    public static void Load(string path)
    {
        if (!File.Exists(path)) return;
        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var i = line.IndexOf('=');
            if (i <= 0) continue;
            var key = line[..i].Trim();
            var value = line[(i + 1)..].Trim().Trim('"');
            if (Environment.GetEnvironmentVariable(key) is null) Environment.SetEnvironmentVariable(key, value);
        }
    }
}
