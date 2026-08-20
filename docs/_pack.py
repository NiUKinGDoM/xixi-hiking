import zipfile, os

OUT = 'XiXi徒步小记-完整备份.zip'
INCLUDE = ['hiking-app3', 'hiking-app3-test', 'backups', 'PROJECT_STATUS.md']
EXCLUDE_DIRS = {'node_modules', 'build', '.gradle', '.cxx', '.externalNativeBuild', '.idea'}
EXCLUDE_EXT = {'.apk', '.log', '.tmp'}

def should_exclude(rel):
    parts = rel.split('/')
    for p in parts:
        if p in EXCLUDE_DIRS:
            return True
    ext = os.path.splitext(rel)[1].lower()
    return ext in EXCLUDE_EXT

count = 0
size = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for item in INCLUDE:
        if os.path.isfile(item):
            zf.write(item, item)
            count += 1
            size += os.path.getsize(item)
        elif os.path.isdir(item):
            for root, dirs, files in os.walk(item):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                for f in files:
                    fp = os.path.join(root, f)
                    rel = os.path.relpath(fp, '.').replace(os.sep, '/')
                    if should_exclude(rel):
                        continue
                    zf.write(fp, rel)
                    count += 1
                    try:
                        size += os.path.getsize(fp)
                    except OSError:
                        pass
print(f'打包完成: {OUT}')
print(f'文件数: {count}, 原始大小: {size/1024/1024:.1f}MB')
print(f'压缩包大小: {os.path.getsize(OUT)/1024/1024:.1f}MB')
