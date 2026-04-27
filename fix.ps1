Get-ChildItem -Path "Src\modules" -Recurse -Include *Routes.js, *Router.js | ForEach-Object {
    $content = Get-Content -Raw $_.FullName
    $content = $content -replace "(?m)^\s*$\r?\n", ""
    Set-Content -Path $_.FullName -Value $content
}
Write-Output "Done!"
