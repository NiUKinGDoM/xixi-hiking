# ============================================================
#  bump-version.ps1 - 每次打包前自动递增 versionCode/versionName
#  用法：在 hiking-app3/android/ 目录下执行 .\bump-version.ps1
#
#  ★新版本号规则（2026-08-11 工具化，用户确认）：
#    versionName = 按 versionCode 数出的 1.x.x.x
#    - 从 1.0.0.0 起算第 1 个版本；每段 0~10 共 11 个值；满 10 进位
#    - 公式：索引 = vc_new - 1；第四段=索引%11；第三段=(索引//11)%11；第二段=(索引//121)%11
#    - 对照：vc84=1.0.7.6、85=1.0.7.7、88=1.0.7.10、89=1.0.8.0、121=1.0.10.10、122=1.1.0.0
# ============================================================
$gradleFile = Join-Path $PSScriptRoot "app\build.gradle"
$htmlFile = Join-Path $PSScriptRoot "..\www\index.html"
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

# ★新规则：按公式算出四段版本号
$idx = $newCode - 1
$seg4 = $idx % 11
$seg3 = [math]::Floor($idx / 11) % 11
$seg2 = [math]::Floor($idx / 121) % 11
$seg1 = 1 + [math]::Floor($idx / 1331)
$newName = "$seg1.$seg2.$seg3.$seg4"

# 读取旧 versionName（仅日志）
$currentName = "?"
if ($content -match 'versionName\s+"([^"]+)"') {
    $currentName = $Matches[1]
}

# 替换 build.gradle
$newContent = $content -replace 'versionCode\s+\d+', "versionCode $newCode"
$newContent = $newContent -replace 'versionName\s+"[^"]+"', "versionName `"$newName`""

# 无 BOM UTF8 写入（避免 Gradle 解析 BOM 报错）
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($gradleFile, $newContent, $utf8NoBom)

# 同步 index.html：版本显示 + version 字段
if (Test-Path $htmlFile) {
    $html = Get-Content $htmlFile -Raw
    $html2 = $html -replace '版本 [\d.]+', "版本 $newName"
    $html2 = $html2 -replace "version:\s*'[\d.]+'", "version: '$newName'"
    if ($html2 -ne $html) {
        [System.IO.File]::WriteAllText($htmlFile, $html2, $utf8NoBom)
        Write-Output "[bump-version] index.html 已同步版本号"
    }
}

Write-Output "[bump-version] versionCode: $currentCode -> $newCode"
Write-Output "[bump-version] versionName: $currentName -> $newName"
