import zipfile, os

OUT = 'XiXi徒步小记-工具链.zip'
INCLUDE = ['jdk-21.0.12', 'gradle-8.2.1', 'android-sdk.zip']
EXCLUDE_DIRS = set()

count = 0
size = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for item in INCLUDE:
        if os.path.isfile(item):
            zf.write(item, item)
            count += 1
            size += os.path.getsize(item)
            print(f'已加入文件: {item}')
        elif os.path.isdir(item):
            for root, dirs, files in os.walk(item):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                for f in files:
                    fp = os.path.join(root, f)
                    rel = os.path.relpath(fp, '.').replace(os.sep, '/')
                    zf.write(fp, rel)
                    count += 1
                    try:
                        size += os.path.getsize(fp)
                    except OSError:
                        pass
print(f'打包完成: {OUT}')
print(f'文件数: {count}, 原始大小: {size/1024/1024:.1f}MB')
print(f'压缩包大小: {os.path.getsize(OUT)/1024/1024:.1f}MB')
