# build-and-save.ps1

$ImageName="zendlert"
$Tag = "latest"
$OutputPath = ".\docker-tars"
# Stop the script immediately if any command fails
$ErrorActionPreference = "Stop"

# ---- Configuration ----
$fullImageName = "${ImageName}:${Tag}"
# Create a safe filename by replacing characters that are invalid in paths
$safeFileName = ($fullImageName -replace ':', '_') + ".tar"
$outputFilePath = Join-Path -Path $OutputPath -ChildPath $safeFileName

Write-Host "--- Starting Docker Build & Save ---" -ForegroundColor Cyan
Write-Host "Image to build: $fullImageName"
Write-Host "Output TAR file will be: $outputFilePath"
Write-Host "------------------------------------" -ForegroundColor Cyan

# ---- STEP 1: Build the Docker Image ----
try {
    Write-Host "[STEP 1/2] Building Docker image..."
    docker build -t $fullImageName .
    Write-Host "SUCCESS: Image '$fullImageName' built successfully!" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: Docker image build failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# ---- STEP 2: Save the Docker Image ----
try {
    Write-Host ""
    Write-Host "[STEP 2/2] Saving image to TAR file..."

    # Ensure the output directory exists
    if (-not (Test-Path -Path $OutputPath)) {
        Write-Host "Output directory not found. Creating '$OutputPath'..."
        New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
    }

    docker save -o $outputFilePath $fullImageName
    Write-Host "SUCCESS: Image saved to '$outputFilePath'" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: Failed to save Docker image to TAR file." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Process completed." -ForegroundColor Yellow