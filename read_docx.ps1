Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = "C:\Users\leno2\Downloads\ola_cars_vehicle_onboarding.docx"

try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    $entry = $zip.GetEntry("word/document.xml")
    $stream = $entry.Open()
    $reader = New-Object System.IO.StreamReader($stream)
    $xmlString = $reader.ReadToEnd()
    $reader.Close()
    $stream.Close()
    
    [xml]$xml = $xmlString
    $text = $xml.document.body.InnerXml -replace '<[^>]+>', ''
    
    # decode HTML entities if any
    $text = [System.Net.WebUtility]::HtmlDecode($text)
    
    Write-Output "--- DOC CONTENT START ---"
    Write-Output $text
    Write-Output "--- DOC CONTENT END ---"
} catch {
    Write-Error $_.Exception.Message
} finally {
    if ($zip) { $zip.Dispose() }
}
