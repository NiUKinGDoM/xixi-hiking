# ============================================================
#  bump-version.ps1 - 每次打包前自动递增 versionCode/versionName
#  用法：在 hiking-app3/android/ 目录下执行 .\bump-version.ps1
# ============================================================
$gradleFile = Join-Path $PSScriptRoot "app\build.gradle"
if (-not (Test-Path $gradleFile)) {
    Write-Error "找不到 $gradleFile"
    exit 1
}

$content = Get-Content $gradleFile -Raw

# 读取当前 versionCode
if ($content -match 'versionCode\s+(\d+)') {
    $currentCode = [int]$Matches[1]
} else {
    $currentCode = 0
}
$newCode = $currentCode + 1

# 读取当前 versionName
if ($content -match 'versionName\s+"([^"]+)"') {
    $currentName = $Matches[1]
} else {
    $currentName = "1.0"
}

# 生成新 versionName：patch 到 10 封顶（1.1.10 后进位到 1.2.0）
$today = Get-Date -Format "yyyyMMdd"
if ($currentName -match '^(\d+)\.(\d+)\.(\d+)$') {
    $major = [int]$Matches[1]; $minor = [int]$Matches[2]; $patch = [int]$Matches[3]
    if ($patch -ge 10) {
        # patch 封顶 10，进位 minor：1.1.10 -> 1.2.0
        $minor = $minor + 1
        $patch = 0
    } else {
        $patch = $patch + 1
    }
    $newName = "$major.$minor.$patch"
} else {
    $newName = "1.0.1"
}

# 替换
$newContent = $content -replace 'versionCode\s+\d+', "versionCode $newCode"
$newContent = $newContent -replace 'versionName\s+"[^"]+"', "versionName `"$newName`""

# 替换（使用无 BOM 的 UTF8 写入，避免 Gradle 解析 BOM 报错）
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($gradleFile, $newContent, $utf8NoBom)
Write-Output "[bump-version] versionCode: $currentCode -> $newCode"
Write-Output "[bump-version] versionName: $currentName -> $newName"