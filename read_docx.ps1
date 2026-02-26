$path = "C:\Users\leno2\Downloads\ola_cars_vehicle_onboarding.docx"
if (-not (Test-Path $path)) {
    Write-Output "File not found: $path"
    exit 1
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($path)
$entry = $zip.GetEntry("word/document.xml")
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$xmlStr = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()

# Replace paragraph tags with newlines for readability 
$xmlStr = $xmlStr -replace '<w:p\b[^>]*>', "`r`n"
# Remove all other XML tags
$xmlStr = $xmlStr -replace '<[^>]+>', ""

Write-Output $xmlStr
