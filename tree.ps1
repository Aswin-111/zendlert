$rootPath = "C:\Users\vivom\Downloads\zendlert"
$outputFile = "C:\Users\vivom\Downloads\zendlert\file-tree.txt"

Clear-Content -Path $outputFile -ErrorAction SilentlyContinue

"File and Folder Tree: $rootPath" | Out-File -FilePath $outputFile
"Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $outputFile -Append
"============================================================" | Out-File -FilePath $outputFile -Append

Get-ChildItem -Path $rootPath -Recurse |
  Where-Object { $_.FullName -notmatch "\\node_modules" } |
  ForEach-Object {
    $relativePath = $_.FullName.Substring($rootPath.Length + 1)
    if ($_.PSIsContainer) {
      $type = "[DIR] "
    } else {
      $type = "[FILE]"
    }
    "$type  $relativePath" | Out-File -FilePath $outputFile -Append
  }

Write-Host "Done! Output saved to: $outputFile"
