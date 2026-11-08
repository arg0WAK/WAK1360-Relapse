/* Standard C Library Headers */
#include <errno.h>
#include <stdarg.h>
#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

/* Networking Headers */
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>

/* System Headers (POSIX) */
#include <fcntl.h>
#include <signal.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/sysctl.h>
#include <unistd.h>

/* Third Party Headers */
#include <microhttpd.h>
#include <ps5/kernel.h>

/* Local Headers */
#include "build/assets.inc"

/**
 * @brief Configuration parameters
 */
 
#define APP_NAME      "WAK1360-Relapse Autoloader"
#define ELFLDR_PORT   9021
#define PORT          11111
#define PROC_NAME     "sce-hell0.elf"
#define TITLE_ID      "WAKR00001"

#define STR_(x)       #x
#define STR(x)        STR_(x)

#define DEEPLINK_URL  "http://127.0.0.1:" STR(PORT) "/app/index.html"
#define HOME_URL      "http://127.0.0.1:" STR(PORT) "/"

#define TOKEN_APP_FILES "@APP_FILES@"
#define TOKEN_BUILD_ID  "@BUILD_ID@"

/* Struct Definitions */
typedef struct {
    char useless1[45];
    char message[3075];
} notify_request_t;

/* External Function Declarations */
extern const uint8_t icon0_png[];
extern const uint8_t icon0_png_end[];

extern int sceNetCtlInit(void);
extern int sceUserServiceInitialize(void *);
extern int sceSystemServiceLaunchWebBrowser(const char *uri);
extern int sceKernelSendNotificationRequest(int device, void *request,
                                            size_t size, int unused);

int sceAppInstUtilInitialize(void);
int sceAppInstUtilTerminate(void);
int sceAppInstUtilAppInstallAll(void *);

static const char param_json[] =
    "{\n"
    "    \"titleId\": \"" TITLE_ID "\",\n"
    "    \"applicationCategoryType\": 65536,\n"
    "    \"deeplinkUri\": \"" DEEPLINK_URL "\",\n"
    "    \"localizedParameters\": {\n"
    "        \"defaultLanguage\": \"en-US\",\n"
    "        \"en-US\": {\n"
    "            \"titleName\": \"" APP_NAME "\"\n"
    "        }\n"
    "    }\n"
    "}\n";

__asm__(".section .rodata\n"
        ".global icon0_png\n"
        ".global icon0_png_end\n"
        ".align 16\n"
        "icon0_png:\n"
        ".incbin \"assets/icon0.png\"\n"
        "icon0_png_end:\n"
        ".previous\n");

static const asset_t *find_asset(const char *url) {
    for (const asset_t *a = assets; a->url; a++)
        if (strcmp(a->url, url) == 0) return a;
    return NULL;
}

static const char *mime_type(const char *path) {
    static const struct { const char *ext, *type; } map[] = {
        {"html", "text/html; charset=utf-8"},
        {"htm", "text/html; charset=utf-8"},
        {"js", "application/javascript; charset=utf-8"},
        {"mjs", "application/javascript; charset=utf-8"},
        {"css", "text/css; charset=utf-8"},
        {"json", "application/json; charset=utf-8"},
        {"txt", "text/plain; charset=utf-8"},
        {"xml", "application/xml"},
        {"svg", "image/svg+xml"},
        {"png", "image/png"},
        {"jpg", "image/jpeg"},
        {"jpeg", "image/jpeg"},
        {"gif", "image/gif"},
        {"webp", "image/webp"},
        {"ico", "image/x-icon"},
        {"woff", "font/woff"},
        {"woff2", "font/woff2"},
        {"ttf", "font/ttf"},
        {"otf", "font/otf"},
        {"mp3", "audio/mpeg"},
        {"ogg", "audio/ogg"},
        {"wav", "audio/wav"},
        {"mp4", "video/mp4"},
        {"webm", "video/webm"},
        {"wasm", "application/wasm"},
        {"appcache", "text/cache-manifest"},
    };
    const char *dot = strrchr(path, '.'), *slash = strrchr(path, '/');
    if (dot && (!slash || dot > slash))
        for (size_t i = 0; i < sizeof(map) / sizeof(map[0]); i++)
            if (strcasecmp(dot + 1, map[i].ext) == 0) return map[i].type;
    return "application/octet-stream";
}

static char *manifest;
static size_t manifest_len;
static const char *const excluded[] = {
    "/app/payloads/orchestrate/",
    NULL
};

static void manifest_add(const char *s, size_t n) {
    char *p = realloc(manifest, manifest_len + n + 1);
    if (!p) return;
    manifest = p;
    memcpy(manifest + manifest_len, s, n);
    manifest_len += n;
    manifest[manifest_len] = '\0';
}

static int starts_with(const char *p, const char *end, const char *tok) {
    size_t n = strlen(tok);
    return (size_t)(end - p) >= n && memcmp(p, tok, n) == 0;
}

static int is_excluded(const char *url) {
    for (const char *const *e = excluded; *e; e++)
        if (strncmp(url, *e, strlen(*e)) == 0)
            return 1;
    return 0;
}

static int build_manifest(void) {
    const asset_t *tpl = find_asset("/app/cache.appcache");
    if (!tpl) return -1;

    const char *p = (const char *)tpl->start, *end = (const char *)tpl->end;
    while (p < end) {
        const char *at = memchr(p, '@', (size_t)(end - p));
        if (!at) {
            manifest_add(p, (size_t)(end - p));
            break;
        }
        manifest_add(p, (size_t)(at - p));
        p = at;

        if (starts_with(p, end, TOKEN_APP_FILES)) {
            for (const asset_t *a = assets; a->url; a++)
                if (strncmp(a->url, "/app/", 5) == 0 && !is_excluded(a->url)) {
                    manifest_add(a->url, strlen(a->url));
                    manifest_add("\n", 1);
                }
            p += sizeof(TOKEN_APP_FILES) - 1;
        } else if (starts_with(p, end, TOKEN_BUILD_ID)) {
            manifest_add(BUILD_ID, sizeof(BUILD_ID) - 1);
            p += sizeof(TOKEN_BUILD_ID) - 1;
        } else {
            manifest_add(p, 1);
            p++;
        }
    }
    return manifest ? 0 : -1;
}

static pid_t find_stale_pid(void) {
    int mib[4] = {1, 14, 8, 0};
    pid_t mypid = getpid(), found = -1;
    size_t size = 0;

    if (sysctl(mib, 4, NULL, &size, NULL, 0)) return -1;
    size += 16 * 1024;
    uint8_t *buf = malloc(size);
    if (!buf) return -1;
    if (sysctl(mib, 4, buf, &size, NULL, 0)) {
        free(buf);
        return -1;
    }

    for (uint8_t *p = buf; p < buf + size;) {
        int len = *(int *)p;
        if (len < 448) break;
        pid_t pid = *(pid_t *)&p[72];
        const char *name = (const char *)&p[447];
        if (pid != mypid && strcmp(name, PROC_NAME) == 0) found = pid;
        p += len;
    }
    free(buf);
    return found;
}

static int kill_stale_instances(void) {
    for (int i = 0; i < 10; i++) {
        pid_t pid = find_stale_pid();
        if (pid <= 0) return 0;
        printf("Found stale instance (pid %d), terminating\n", (int)pid);
        if (kill(pid, SIGKILL)) return -1;
        usleep(500000);
    }
    return -1;
}

static int send_payload(const unsigned char *payload, size_t size) {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) return -1;
    struct sockaddr_in server;
    memset(&server, 0, sizeof(server));
    server.sin_family = AF_INET;
    server.sin_port = htons(ELFLDR_PORT);
    server.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    
    if (connect(sock, (struct sockaddr *)&server, sizeof(server)) < 0) {
        close(sock);
        return -1;
    }
    size_t sent = 0;
    while (sent < size) {
        ssize_t ret = send(sock, payload + sent, size - sent, 0);
        if (ret <= 0) break;
        sent += ret;
    }
    close(sock);
    return (sent == size) ? 0 : -1;
}

static void notify(const char *fmt, ...) {
    notify_request_t req;
    va_list args;

    memset(&req, 0, sizeof(req));
    va_start(args, fmt);
    vsnprintf(req.message, sizeof(req.message), fmt, args);
    va_end(args);

    sceKernelSendNotificationRequest(0, &req, sizeof(req), 0);
    printf("[Notify] %s\n", req.message);
}

static int mkdir_p(const char *path, mode_t mode) {
    char tmp[256];
    snprintf(tmp, sizeof(tmp), "%s", path);
    for (char *p = tmp + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            if (mkdir(tmp, mode) != 0 && errno != EEXIST) return -1;
            *p = '/';
        }
    }
    return (mkdir(tmp, mode) != 0 && errno != EEXIST) ? -1 : 0;
}

static int write_file(const char *path, const void *data, size_t size) {
    FILE *f = fopen(path, "wb");
    if (!f) return -1;
    int ok = fwrite(data, size, 1, f) == 1;
    fclose(f);
    return ok ? 0 : -1;
}

static int file_differs(const char *path, const void *expected, size_t size) {
    struct stat st;
    if (stat(path, &st) != 0 || (size_t)st.st_size != size) return 1;

    FILE *f = fopen(path, "rb");
    if (!f) return 1;
    uint8_t *buf = malloc(size);
    int differs = !buf || fread(buf, 1, size, f) != size ||
                  memcmp(buf, expected, size) != 0;
    free(buf);
    fclose(f);
    return differs;
}

static int install_app(void) {
    const char *base = "/user/app/" TITLE_ID;
    const char *param_path = "/user/app/" TITLE_ID "/sce_sys/param.json";
    const char *icon_path = "/user/app/" TITLE_ID "/sce_sys/icon0.png";
    const char *sys_dir = "/user/app/" TITLE_ID "/sce_sys";

    const size_t param_size = sizeof(param_json) - 1;
    const size_t icon_size = (size_t)(icon0_png_end - icon0_png);

    struct stat st;
    int exists = stat(base, &st) == 0;
    if (exists && !file_differs(param_path, param_json, param_size) &&
        !file_differs(icon_path, icon0_png, icon_size))
        return 0;

    notify(exists ? "Updating " APP_NAME " app..." : "Installing " APP_NAME " app...");

    int err = sceAppInstUtilInitialize();
    if (err) {
        printf("sceAppInstUtilInitialize: 0x%08X\n", err);
        return -1;
    }

    int ret = -1;
    if (mkdir_p(sys_dir, 0755) != 0) {
        printf("mkdir failed: %s (errno %d)\n", sys_dir, errno);
    } else if (write_file(param_path, param_json, param_size) != 0) {
        printf("failed to write param.json\n");
    } else if (write_file(icon_path, icon0_png, icon_size) != 0) {
        printf("failed to write icon0.png\n");
    } else {
        int (*install_title_dir)(const char *, const char *, void *) = NULL;
        uint32_t handle;
        if (!kernel_dynlib_handle(-1, "libSceAppInstUtil.sprx", &handle))
            install_title_dir = (void *)kernel_dynlib_resolve(-1, handle, "Wudg3Xe3heE");

        err = install_title_dir ? install_title_dir(TITLE_ID, "/user/app/", 0)
                                : sceAppInstUtilAppInstallAll(0);
        if (err) printf("install error: 0x%08X\n", err);
        else     ret = 0;
    }

    sceAppInstUtilTerminate();
    
    if (ret == 0) {
        notify(APP_NAME " app ready!");
    }
    return ret;
}

static int push_orchestrator(void) {
    const asset_t *orch = find_asset("/install/payloads/orchestrator.elf");
    if (!orch) { 
        notify("sce-hell0: Orchestrator asset not found");
        return -1;
    }
    size_t orch_size = (size_t)(orch->end - orch->start);
    int result = send_payload(orch->start, orch_size);
    if (result == 0) {
        notify("sce-hell0: Orchestrator payload sent to port %d", ELFLDR_PORT);
        return 0;
    } else {
        notify("sce-hell0: Failed to send orchestrator payload");
        return -1;
    }
}

static atomic_int keep_running = 1;

static enum MHD_Result reply(struct MHD_Connection *c, unsigned int status,
                             const void *body, size_t len, const char *type,
                             int no_cache) {
    struct MHD_Response *r =
        MHD_create_response_from_buffer(len, (void *)body, MHD_RESPMEM_PERSISTENT);
    if (!r) return MHD_NO;
    MHD_add_response_header(r, "Content-Type", type);
    MHD_add_response_header(r, "Access-Control-Allow-Origin", "*");
    if (no_cache) MHD_add_response_header(r, "Cache-Control", "no-cache");
    enum MHD_Result res = MHD_queue_response(c, status, r);
    MHD_destroy_response(r);
    return res;
}

#define REPLY_TEXT(c, status, s) reply(c, status, s, strlen(s), "text/plain", 0)

static char request_started; 

static enum MHD_Result reply_ok_and_stop(struct MHD_Connection *c) {
    atomic_store(&keep_running, 0);
    return REPLY_TEXT(c, MHD_HTTP_OK, "OK");
}

static enum MHD_Result handle_install(struct MHD_Connection *c) {
    int ret = install_app();
    if (ret != 0) {
        return REPLY_TEXT(c, MHD_HTTP_INTERNAL_SERVER_ERROR, "Install failed");
    }

    int result = push_orchestrator();
    
    if (result != 0) {
        return REPLY_TEXT(c, MHD_HTTP_INTERNAL_SERVER_ERROR, "Failed to push orchestrator");
    }

    return reply_ok_and_stop(c);
}

static enum MHD_Result handle_asset(struct MHD_Connection *c, const char *url) {
    const char *path = strcmp(url, "/") == 0 ? "/index.html" : url;

    if (strcmp(path, "/app/cache.appcache") == 0)
        return reply(c, MHD_HTTP_OK, manifest, manifest_len,
                     "text/cache-manifest", 1);

    const asset_t *a = find_asset(path);
    if (!a)
        return REPLY_TEXT(c, MHD_HTTP_NOT_FOUND, "404 Not Found\n");

    return reply(c, MHD_HTTP_OK, a->start, (size_t)(a->end - a->start),
                 mime_type(path), 0);
}

static const struct {
    const char *url;
    enum MHD_Result (*handler)(struct MHD_Connection *);
} routes[] = {
    { "/install", handle_install    },
    { "/exit",    reply_ok_and_stop },
};

static enum MHD_Result on_request(void *cls, struct MHD_Connection *c,
                                  const char *url, const char *method,
                                  const char *version, const char *upload_data,
                                  size_t *upload_size, void **con_cls) {
    (void)cls; (void)version; (void)upload_data; (void)upload_size;

    if (!*con_cls) {
        *con_cls = &request_started;
        return MHD_YES;
    }

    if (strcmp(method, "OPTIONS") == 0)
        return REPLY_TEXT(c, MHD_HTTP_OK, "OK");

    for (size_t i = 0; i < sizeof routes / sizeof routes[0]; i++)
        if (strcmp(url, routes[i].url) == 0)
            return routes[i].handler(c);

    return handle_asset(c, url);
}

int main(void) {
    syscall(SYS_thr_set_name, -1, PROC_NAME);
    int stale_failed = kill_stale_instances() != 0;

    notify(APP_NAME " installer starting on port %d", PORT);
    if (stale_failed) notify("Could not stop the previous instance");

    if (build_manifest() != 0) {
        notify("cache.appcache could not be built");
        return EXIT_FAILURE;
    }
    if (sceNetCtlInit() != 0)
        notify("Network controller initialization failed");
    int user_priority = 256;
    if (sceUserServiceInitialize(&user_priority) != 0)
        notify("User service initialization failed");

    signal(SIGPIPE, SIG_IGN);
    signal(SIGHUP, SIG_IGN);
    signal(SIGTERM, SIG_IGN);

    struct MHD_Daemon *daemon = NULL;
    for (int i = 0; i < 5 && !daemon; i++) {
        daemon = MHD_start_daemon(
            MHD_USE_INTERNAL_POLLING_THREAD, PORT, NULL, NULL, &on_request, NULL,
            MHD_OPTION_THREAD_POOL_SIZE, (unsigned int)4, MHD_OPTION_END);
        if (!daemon) sleep(1);
    }
    if (!daemon) {
        notify(APP_NAME " installer: port %d is used by another program", PORT);
        return EXIT_FAILURE;
    }
    notify("HTTP server ready on port %d", PORT);

    if (sceSystemServiceLaunchWebBrowser(HOME_URL) != 0) {
        notify("Failed to launch browser");
        return EXIT_FAILURE;
    }
    notify("Browser opened; waiting for AppCache install");

    while (atomic_load(&keep_running)) usleep(100000);

    MHD_stop_daemon(daemon);
    return EXIT_SUCCESS;
}