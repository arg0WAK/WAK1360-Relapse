#!/bin/sh
set -e
LC_ALL=C
export LC_ALL

die() { echo "gen_assets: $*" >&2; exit 1; }

[ -f install/index.html ]     || die "install/index.html not found"
[ -f app/cache.appcache ] || die "app/cache.appcache not found"
[ -f app/index.html ]         || die "app/index.html not found"

EXCLUDE_DIRS="app/node_modules"
EXCLUDE_FILES="app/package.json app/package-lock.json app/js/utils/int64.js app/js/utils/mem.js app/js/utils/rop_slave.js app/js/kexp.js app/js/main.js app/js/webkit.js app/js/relapse_exploit.js app/build.mjs"

PRUNE_ARGS=""
for dir in $EXCLUDE_DIRS; do
    PRUNE_ARGS="$PRUNE_ARGS -path $dir -prune -o"
done

if [ -n "$EXCLUDE_FILES" ]; then
    GREP_REGEX="^($(echo $EXCLUDE_FILES | tr ' ' '|'))$"
    files=$(find install app $PRUNE_ARGS -type f ! -path '*/.*' -print | grep -vE "$GREP_REGEX" | sort)
else
    files=$(find install app $PRUNE_ARGS -type f ! -path '*/.*' -print | sort)
fi

bad=$(printf '%s\n' "$files" | grep -v '^[A-Za-z0-9._/-]*$' || true)
[ -z "$bad" ] || die "invalid filename (allowed characters: A-Z a-z 0-9 . _ - /): $bad"

build_id=$( { printf '%s\n' "$files"; cat $files; } | cksum | cut -d' ' -f1 )

entries=$(printf '%s\n' "$files" | while read -r f; do
  case "$f" in
    install/index.html) printf '/index.html\t%s\n' "$f" ;; 
    *)                  printf '/%s\t%s\n' "$f" "$f" ;;    
  esac
done | sort)

echo "/* Auto-generated (tools/gen_assets.sh) - Don't edit */"
echo "#define BUILD_ID \"$build_id\""

cat <<'EOF'
typedef struct {
    const char *url;
    const unsigned char *start, *end;
} asset_t;

EOF

printf '%s\n' "$entries" | awk -F'\t' '
BEGIN { print "__asm__(\".section .rodata\\n\"" }
{ n = NR - 1
  printf "    \".balign 16\\n.global asset_%d\\n.global asset_%d_end\\nasset_%d:\\n.incbin \\\"%s\\\"\\nasset_%d_end:\\n\"\n", n, n, n, $2, n }
END { print "    \".previous\\n\");\n" }
'

printf '%s\n' "$entries" | awk -F'\t' '
{ printf "extern const unsigned char asset_%d[], asset_%d_end[];\n", NR-1, NR-1 }
'

echo
echo "static const asset_t assets[] = {"
printf '%s\n' "$entries" | awk -F'\t' '
{ printf "    {\"%s\", asset_%d, asset_%d_end},\n", $1, NR-1, NR-1 }
'
echo "    {0, 0, 0}"
echo "};"