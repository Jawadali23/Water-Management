$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($args.Count -gt 0) { [int]$args[0] } else { 5500 }

Add-Type -AssemblyName System.Net.HttpListener

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "No-cache dev server running at http://127.0.0.1:$port/Frontend/index.html"
Write-Host "Serving: $root"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
  ".ico" = "image/x-icon"
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $requestPath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))

    if ([string]::IsNullOrWhiteSpace($requestPath)) {
      $requestPath = "Frontend/index.html"
    }

    $relativeParts = $requestPath -split "/" | Where-Object { $_ -and $_ -ne "." -and $_ -ne ".." }
    $filePath = Join-Path $root ([IO.Path]::Combine($relativeParts))

    if ((Test-Path -LiteralPath $filePath -PathType Container)) {
      $filePath = Join-Path $filePath "index.html"
    }

    if (!(Test-Path -LiteralPath $filePath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes("Not found")
    } else {
      $context.Response.StatusCode = 200
      $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
      $bytes = [IO.File]::ReadAllBytes($filePath)
    }

    $context.Response.Headers.Set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    $context.Response.Headers.Set("Pragma", "no-cache")
    $context.Response.Headers.Set("Expires", "0")
    $context.Response.Headers.Set("Access-Control-Allow-Origin", "*")
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.OutputStream.Close()
  }
} finally {
  $listener.Stop()
}
