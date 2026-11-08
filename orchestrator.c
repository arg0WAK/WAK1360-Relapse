/* Standard C Library Headers */
#include <stdarg.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Networking Headers */
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>

/* System Headers (POSIX) */
#include <signal.h>
#include <sys/syscall.h>
#include <sys/sysctl.h>
#include <unistd.h>

/* Threading Headers */
#include <pthread.h>

/* Third Party Headers */
#include <microhttpd.h>

/* Local Headers */
#include "build/payloads.inc"

/**
 * @brief Configuration parameters
 */

#define ELFLDR_PORT 9021
#define KILL_DELAY_US 300000
#define KILL_SIGNAL SIGTERM
#define MAX_TASKS 10
#define POLL_INTERVAL_US 100000
#define PORT 11110
#define PROC_NAME "orchestrator.elf"
#define RESTORE_TIMEOUT_POLLS 100
#define TARGET_PROC_NAME "SceShellUI"

/* Struct Definitions */
typedef struct {
    char name[64];
    int delay;
} task_t;

typedef struct {
    char useless1[45];
    char message[3075];
} notify_request_t;

/* External Function Declarations */
extern int sceKernelSendNotificationRequest(int device, void *request, size_t size, int unused);
extern int sceNetCtlInit(void);
extern int kernel_set_ucred_authid(int td, uint64_t auth_id);

/* Function Implementations */
static void notify(const char *fmt, ...) {
    notify_request_t req;
    va_list args;
    memset(&req, 0, sizeof(req));
    va_start(args, fmt);
    vsnprintf(req.message, sizeof(req.message), fmt, args);
    va_end(args);
    sceKernelSendNotificationRequest(0, &req, sizeof(req), 0);
}

static pid_t find_pid_by_name(const char *target_name) {
    int mib[4] = {1, 14, 8, 0};
    pid_t mypid = getpid();
    size_t size = 0;
    if (sysctl(mib, 4, NULL, &size, NULL, 0)) return -1;
    size += 16 * 1024;
    uint8_t *buf = malloc(size);
    if (!buf) return -1;
    if (sysctl(mib, 4, buf, &size, NULL, 0)) {
        free(buf);
        return -1;
    }
    pid_t found = -1;
    for (uint8_t *p = buf; p < buf + size;) {
        int len = *(int *)p;
        if (len < 448) break;
        pid_t pid = *(pid_t *)&p[72];
        const char *name = (const char *)&p[447];
        if (pid != mypid && strcmp(name, target_name) == 0) {
            found = pid;
            break;
        }
        p += len;
    }
    free(buf);
    return found;
}

static void kill_stale_instances(void) {
    for (int i = 0; i < 5; i++) {
        pid_t pid = find_pid_by_name(PROC_NAME);
        if (pid <= 0) return;
        notify("Found stale instance (pid %d), terminating\n", (int)pid);
        kill(pid, SIGKILL);
        usleep(500000);
    }
}

static atomic_int keep_running = 1;
static atomic_int kill_pending = 0;

static task_t task_queue[MAX_TASKS];
static int task_count = 0;
static pthread_mutex_t task_lock = PTHREAD_MUTEX_INITIALIZER;

static void kill_shellui(void) {
    pid_t pid = find_pid_by_name(TARGET_PROC_NAME);
    if (pid <= 0) return;

    kill(pid, KILL_SIGNAL);

    for (int i = 0; i < RESTORE_TIMEOUT_POLLS; i++) {
        if (find_pid_by_name(TARGET_PROC_NAME) != pid) break;
        usleep(POLL_INTERVAL_US);
    }
}

static bool wait_for_shellui_restore(void) {
    for (int i = 0; i < RESTORE_TIMEOUT_POLLS; i++) {
        if (find_pid_by_name(TARGET_PROC_NAME) > 0) return true;
        usleep(POLL_INTERVAL_US);
    }
    return false;
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

static void *sequence_thread(void *arg) {
    (void)arg;

    task_t local[MAX_TASKS];
    int n;

    pthread_mutex_lock(&task_lock);
    n = task_count;
    memcpy(local, task_queue, n * sizeof(local[0]));
    task_count = 0;
    pthread_mutex_unlock(&task_lock);

    usleep(KILL_DELAY_US);
    kill_shellui();
    notify("SceShellUI restarted, queue will start after it is restored");

    if (!wait_for_shellui_restore()) {
        notify("SceShellUI restore timed out, exiting");
        usleep(500000);
        atomic_store(&kill_pending, 0);
        atomic_store(&keep_running, 0);
        return NULL;
    }
    notify("SceShellUI restored, queue will start");

    for (int i = 0; i < n; i++) {
        if (local[i].delay > 0) {
            sleep(local[i].delay);
        }

    const embedded_payload_t *p = NULL;
    for (int j = 0; all_payloads[j].name != NULL; j++) {
        if (strcmp(all_payloads[j].name, local[i].name) == 0) {
            p = &all_payloads[j];
            break;
        }
    }

    if (p) {
        notify("%s (%d) sending...", p->name, ELFLDR_PORT);
        send_payload(p->data, p->size);
    } else {
        notify("FAIL: %s not found!", local[i].name);
    }
}
    notify("Queue finished, exiting");
    usleep(500000);
    atomic_store(&kill_pending, 0);
    atomic_store(&keep_running, 0);
    return NULL;
}

static enum MHD_Result reply(struct MHD_Connection *c, unsigned int status, const char *body) {
    struct MHD_Response *r = MHD_create_response_from_buffer(
        strlen(body), (void *)body, MHD_RESPMEM_PERSISTENT);
    if (!r) return MHD_NO;
    MHD_add_response_header(r, "Content-Type", "text/plain");
    MHD_add_response_header(r, "Access-Control-Allow-Origin", "*");
    MHD_add_response_header(r, "Connection", "close");
    MHD_add_response_header(r, "Cache-Control", "no-cache");
    enum MHD_Result res = MHD_queue_response(c, status, r);
    MHD_destroy_response(r);
    return res;
}

static enum MHD_Result on_request(void *cls, struct MHD_Connection *c,
                                  const char *url, const char *method,
                                  const char *version, const char *upload_data,
                                  size_t *upload_size, void **con_cls) {
    if (*con_cls == NULL) {
        *con_cls = (void *)1;
        return MHD_YES;
    }
    if (strcmp(method, "OPTIONS") == 0) return reply(c, MHD_HTTP_OK, "OK");

    if (strcmp(url, "/list_payloads") == 0) {
        char list[2048] = "";
        for (int i = 0; all_payloads[i].name != NULL; i++) {
            strcat(list, all_payloads[i].name);
            if (all_payloads[i+1].name != NULL) strcat(list, ",");
        }
        return reply(c, MHD_HTTP_OK, list);
    }

    if (strcmp(url, "/clear_tasks") == 0) {
        pthread_mutex_lock(&task_lock);
        task_count = 0;
        pthread_mutex_unlock(&task_lock);
        return reply(c, MHD_HTTP_OK, "Queue cleared");
    }

    if (strcmp(url, "/add_task") == 0) {
        const char *name = MHD_lookup_connection_value(c, MHD_GET_ARGUMENT_KIND, "name");
        const char *delay_str = MHD_lookup_connection_value(c, MHD_GET_ARGUMENT_KIND, "delay");
        pthread_mutex_lock(&task_lock);
        
        if (name && task_count < MAX_TASKS) {
            strncpy(task_queue[task_count].name, name, 63);
            task_queue[task_count].name[63] = '\0';
            task_queue[task_count].delay = delay_str ? atoi(delay_str) : 0;
            task_count++;
            pthread_mutex_unlock(&task_lock);
            return reply(c, MHD_HTTP_OK, "Task added");
        }
        pthread_mutex_unlock(&task_lock);
        return reply(c, MHD_HTTP_BAD_REQUEST, "Task could not be added (Missing parameter or queue full)");
    }

    if (strcmp(url, "/trigger_sequence") == 0) {
        if (atomic_exchange(&kill_pending, 1) == 0) {
            pthread_t t;
            if (pthread_create(&t, NULL, sequence_thread, NULL) == 0)
                pthread_detach(t);
            else
                atomic_store(&kill_pending, 0);
        }
        return reply(c, MHD_HTTP_OK, "Sequence triggered");
    }

    if (strcmp(url, "/exit") == 0) {
        atomic_store(&keep_running, 0);
        return reply(c, MHD_HTTP_OK, "OK");
    }
    
    return reply(c, MHD_HTTP_NOT_FOUND, "404 Not Found\n");
}

int main(void) {
    syscall(SYS_thr_set_name, -1, PROC_NAME);
    kill_stale_instances();
    if (sceNetCtlInit() != 0) notify("sceNetCtlInit failed");
    kernel_set_ucred_authid(-1, 0x4801000000000013L);

    signal(SIGPIPE, SIG_IGN);
    signal(SIGHUP, SIG_IGN);
    signal(SIGTERM, SIG_IGN);

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(PORT);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);

    struct MHD_Daemon *daemon = NULL;
    for (int i = 0; i < 5 && !daemon; i++) {
        daemon = MHD_start_daemon(
            MHD_USE_INTERNAL_POLLING_THREAD, PORT, NULL, NULL, &on_request,
            NULL, MHD_OPTION_SOCK_ADDR, (struct sockaddr *)&addr,
            MHD_OPTION_THREAD_POOL_SIZE, (unsigned int)2, MHD_OPTION_END);
        if (!daemon) sleep(1);
    }
        
    if (!daemon) return EXIT_FAILURE;
    while (atomic_load(&keep_running)) usleep(POLL_INTERVAL_US);

    MHD_stop_daemon(daemon);
    return EXIT_SUCCESS;
}