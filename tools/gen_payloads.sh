#!/bin/sh
PAYLOAD_DIR="app/payloads/orchestrate"

echo "// Auto-generated (tools/gen_payloads.sh) - Don't edit"

cat <<'EOF'
typedef struct { 
    const char *name; 
    const unsigned char *data; 
    size_t size; 
} embedded_payload_t;

EOF

for f in "$PAYLOAD_DIR"/*.elf; do
    if [ -f "$f" ]; then
        var_name=$(basename "$f" | sed 's/[^a-zA-Z0-9]/_/g')
        xxd -i "$f" | sed "s/unsigned char .*/const unsigned char ${var_name}[] = {/"
    fi
done

echo "static const embedded_payload_t all_payloads[] = {"
for f in "$PAYLOAD_DIR"/*.elf; do
    if [ -f "$f" ]; then
        var_name=$(basename "$f" | sed 's/[^a-zA-Z0-9]/_/g')
        file_name=$(basename "$f")
        echo "    {\"${file_name}\", ${var_name}, sizeof(${var_name})},"
    fi
done
echo "    {NULL, NULL, 0}"
echo "};"