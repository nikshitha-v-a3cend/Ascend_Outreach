Add-Type -AssemblyName System.Drawing
$imgPath = "c:\Users\Nikshitha\Desktop\a3cend-outreach-test\public\logo.png"
$img = [System.Drawing.Bitmap]::FromFile($imgPath)
Write-Output "Width: $($img.Width), Height: $($img.Height)"

$minX = $img.Width; $minY = $img.Height; $maxX = 0; $maxY = 0

for ($y = 0; $y -lt $img.Height; $y++) {
    for ($x = 0; $x -lt $img.Width; $x++) {
        $c = $img.GetPixel($x, $y)
        if ($c.A -gt 20 -and ($c.R -lt 245 -or $c.G -lt 245 -or $c.B -lt 245)) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
$cropW = $maxX - $minX + 1
$cropH = $maxY - $minY + 1
Write-Output "Bounds: $minX, $minY to $maxX, $maxY ($cropW x $cropH)"

$cropped = New-Object System.Drawing.Bitmap $cropW, $cropH
$g = [System.Drawing.Graphics]::FromImage($cropped)
$srcRect = New-Object System.Drawing.Rectangle $minX, $minY, $cropW, $cropH
$destRect = New-Object System.Drawing.Rectangle 0, 0, $cropW, $cropH
$g.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$img.Dispose()

$cropped.Save("c:\Users\Nikshitha\Desktop\a3cend-outreach-test\public\logo-cropped.png", [System.Drawing.Imaging.ImageFormat]::Png)
$cropped.Dispose()
Write-Output "Saved cropped logo to public/logo-cropped.png"
