#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <linux/audit.h>
#include <linux/capability.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <poll.h>
#include <sched.h>
#include <signal.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/mount.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <unistd.h>

#define MIB (1024UL * 1024)
#define REQUIRE(condition) do { if (!(condition)) _exit(125); } while (0)
#define SAY(value) REQUIRE(write(STDOUT_FILENO, value, sizeof(value) - 1) == sizeof(value) - 1)
#define ALLOW(number) BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, number, 0, 1), \
    BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW)

static const char fixture[] = "M10-04D harmless descriptor canary\n";
static const char *const namespaces[] = {
    "/proc/self/ns/user", "/proc/self/ns/mnt", "/proc/self/ns/net",
    "/proc/self/ns/pid", "/proc/self/ns/ipc", "/proc/self/ns/uts",
};
static const char *const cases[] = {
    "isolation", "pids", "cpu", "memory", "stdout", "stderr", "timeout", "watchdog", "exit",
};

static void write_control(const char *path, const char *value)
{
    int fd = open(path, O_WRONLY | O_NOFOLLOW | O_CLOEXEC);
    REQUIRE(fd >= 0);
    REQUIRE(write(fd, value, strlen(value)) == (ssize_t)strlen(value));
    REQUIRE(close(fd) == 0);
}

static void limit(int resource, rlim_t value)
{
    struct rlimit bound = { value, value };
    REQUIRE(setrlimit(resource, &bound) == 0);
}

static void enter_namespaces(uid_t uid, gid_t gid)
{
    char map[64];
    REQUIRE(unshare(CLONE_NEWUSER) == 0);
    write_control("/proc/self/setgroups", "deny");
    REQUIRE(snprintf(map, sizeof(map), "65534 %u 1\n", uid) > 0);
    write_control("/proc/self/uid_map", map);
    REQUIRE(snprintf(map, sizeof(map), "65534 %u 1\n", gid) > 0);
    write_control("/proc/self/gid_map", map);
    REQUIRE(unshare(CLONE_NEWNS | CLONE_NEWNET | CLONE_NEWPID | CLONE_NEWIPC | CLONE_NEWUTS) == 0);
}

static void enter_private_root(const char *root, const struct stat *before)
{
    for (size_t i = 0; i < sizeof(namespaces) / sizeof(*namespaces); ++i) {
        struct stat after;
        REQUIRE(stat(namespaces[i], &after) == 0);
        REQUIRE(before[i].st_ino != after.st_ino);
    }
    REQUIRE(getpid() == 1 && getppid() == 0);
    REQUIRE(mount(NULL, "/", NULL, MS_REC | MS_PRIVATE, NULL) == 0);
    REQUIRE(mount("tmpfs", root, "tmpfs", MS_NODEV | MS_NOSUID | MS_NOEXEC, "size=65536,nr_inodes=16,mode=0700,uid=65534,gid=65534") == 0);
    REQUIRE(chdir(root) == 0);
    REQUIRE(mkdir(".old", 0700) == 0);
    REQUIRE(syscall(SYS_pivot_root, ".", ".old") == 0);
    REQUIRE(chdir("/") == 0);
    REQUIRE(umount2("/.old", MNT_DETACH) == 0);
    REQUIRE(rmdir("/.old") == 0);

    struct stat source;
    char bytes[sizeof(fixture)];
    REQUIRE(fcntl(5, F_GETFL) >= 0 && (fcntl(5, F_GETFL) & O_ACCMODE) == O_RDONLY);
    REQUIRE(fstat(5, &source) == 0 && S_ISREG(source.st_mode) && source.st_size == sizeof(fixture) - 1);
    REQUIRE(read(5, bytes, sizeof(bytes)) == sizeof(fixture) - 1);
    REQUIRE(memcmp(bytes, fixture, sizeof(fixture) - 1) == 0);
    REQUIRE(close(5) == 0);
    int fd = open("/input", O_CREAT | O_EXCL | O_WRONLY | O_CLOEXEC, 0400);
    REQUIRE(fd >= 0);
    REQUIRE(write(fd, bytes, sizeof(fixture) - 1) == sizeof(fixture) - 1);
    REQUIRE(close(fd) == 0);
    REQUIRE(mount(NULL, "/", NULL, MS_REMOUNT | MS_RDONLY | MS_NODEV | MS_NOSUID | MS_NOEXEC, NULL) == 0);
}

static void restrict_syscalls(void)
{
    struct __user_cap_header_struct header = { _LINUX_CAPABILITY_VERSION_3, 0 };
    struct __user_cap_data_struct caps[2] = {{0}};
    int last = prctl(PR_CAPBSET_READ, CAP_SETFCAP, 0, 0, 0);
    REQUIRE(last >= 0);
    for (unsigned int cap = 0; cap < 64; ++cap) {
        if (prctl(PR_CAPBSET_DROP, cap, 0, 0, 0) == -1) REQUIRE(errno == EINVAL && cap > CAP_SETFCAP);
    }
    REQUIRE(prctl(PR_CAP_AMBIENT, PR_CAP_AMBIENT_CLEAR_ALL, 0, 0, 0) == 0);
    REQUIRE(syscall(SYS_capset, &header, caps) == 0);
    REQUIRE(prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) == 0);

    struct sock_filter instructions[] = {
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, AUDIT_ARCH_X86_64, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
        ALLOW(SYS_read), ALLOW(SYS_write), ALLOW(SYS_close), ALLOW(SYS_openat),
        ALLOW(SYS_getuid), ALLOW(SYS_geteuid), ALLOW(SYS_getgid), ALLOW(SYS_getegid),
        ALLOW(SYS_capget), ALLOW(SYS_exit), ALLOW(SYS_exit_group), ALLOW(SYS_wait4),
        ALLOW(SYS_pause),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_prctl, 0, 5),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, PR_GET_NO_NEW_PRIVS, 2, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, PR_GET_SECCOMP, 1, 0),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, PR_CAPBSET_READ, 0, 11),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_clone, 0, 5),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0]) + 4),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, 0, 0, 7),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SIGCHLD, 0, 5),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
        BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, SYS_mmap, 0, 3),
        BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[2])),
        BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, PROT_EXEC, 1, 0),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
        BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | EPERM),
    };
    struct sock_fprog program = { sizeof(instructions) / sizeof(*instructions), instructions };
    REQUIRE(prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program) == 0);
}

static void check_isolation(const char *canary, int report)
{
    struct __user_cap_header_struct header = { _LINUX_CAPABILITY_VERSION_3, 0 };
    struct __user_cap_data_struct caps[2];
    REQUIRE(getuid() == 65534 && geteuid() == 65534 && getgid() == 65534 && getegid() == 65534);
    REQUIRE(prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0) == 1);
    REQUIRE(prctl(PR_GET_SECCOMP, 0, 0, 0, 0) == SECCOMP_MODE_FILTER);
    REQUIRE(prctl(PR_CAPBSET_READ, CAP_SYS_ADMIN, 0, 0, 0) == 0);
    REQUIRE(syscall(SYS_capget, &header, caps) == 0);
    for (size_t i = 0; i < 2; ++i) {
        REQUIRE(caps[i].effective == 0 && caps[i].permitted == 0 && caps[i].inheritable == 0);
    }
    if (report) SAY("NAMESPACES_OK\n");
    REQUIRE(syscall(SYS_setuid, 0) == -1 && errno == EPERM);
    if (report) SAY("NON_ROOT_NO_NEW_PRIVS_OK\n");
    REQUIRE(syscall(SYS_socket, AF_INET, SOCK_STREAM, 0) == -1 && errno == EPERM);
    if (report) SAY("NETWORK_DENIED\n");
    REQUIRE(syscall(SYS_unshare, CLONE_NEWUSER) == -1 && errno == EPERM);
    REQUIRE(mmap(NULL, 4096, PROT_EXEC, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0) == MAP_FAILED && errno == EPERM);
    if (report) SAY("SYSCALL_DENIED\n");
    REQUIRE(open(canary, O_RDONLY) == -1 && errno == ENOENT);
    REQUIRE(open("/proc/self/status", O_RDONLY) == -1 && errno == ENOENT);
    REQUIRE(open("/output", O_CREAT | O_WRONLY, 0600) == -1 && errno == EROFS);
    int fd = open("/input", O_RDONLY);
    char bytes[sizeof(fixture)];
    REQUIRE(fd >= 0);
    REQUIRE(read(fd, bytes, sizeof(bytes)) == sizeof(fixture) - 1);
    REQUIRE(memcmp(bytes, fixture, sizeof(fixture) - 1) == 0);
    REQUIRE(close(fd) == 0);
    if (report) SAY("FILESYSTEM_ALLOWLIST_OK\n");
    REQUIRE(mmap(NULL, 129 * MIB, PROT_NONE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0) == MAP_FAILED && errno == ENOMEM);
    if (report) SAY("ADDRESS_SPACE_LIMIT_OK\n");
}

static pid_t child_with_bounded_wait(void)
{
    pid_t child = syscall(SYS_clone, SIGCHLD, 0, 0, 0, 0);
    if (child == 0) {
        for (;;) pause();
    }
    REQUIRE(child > 0);
    return child;
}

static void challenge(const char *name)
{
    if (strcmp(name, "pids") == 0) {
        child_with_bounded_wait();
        child_with_bounded_wait();
        REQUIRE(syscall(SYS_clone, SIGCHLD, 0, 0, 0, 0) == -1 && errno == EAGAIN);
        // Exiting namespace PID 1 kills the two blocked children. The supervisor verifies an empty cgroup.
        SAY("PID_LIMIT_OK\n");
    } else if (strcmp(name, "cpu") == 0) {
        SAY("CPU_READY\n");
        for (;;) __asm__ volatile("" ::: "memory");
    } else if (strcmp(name, "memory") == 0) {
        SAY("MEMORY_READY\n");
        volatile unsigned char *bytes = mmap(NULL, 48 * MIB, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        REQUIRE(bytes != MAP_FAILED);
        for (size_t i = 0; i < 48 * MIB; i += 4096) bytes[i] = 1;
        _exit(124);
    } else if (strcmp(name, "timeout") == 0 || strcmp(name, "watchdog") == 0) {
        child_with_bounded_wait();
        SAY("DESCENDANT_READY\n");
        for (;;) pause();
    } else if (strcmp(name, "stdout") == 0 || strcmp(name, "stderr") == 0) {
        char bytes[4096] = {0};
        int fd = strcmp(name, "stdout") == 0 ? STDOUT_FILENO : STDERR_FILENO;
        unsigned int blocks = fd == STDOUT_FILENO ? 16 : 2;
        for (unsigned int i = 0; i < blocks; ++i) REQUIRE(write(fd, bytes, sizeof(bytes)) == sizeof(bytes));
        REQUIRE(write(fd, bytes, 1) == 1);
    } else if (strcmp(name, "exit") == 0) {
        _exit(73);
    }
}

int main(int argc, char **argv, char **envp)
{
    REQUIRE(argc == 3 && envp[0] == NULL);
    int allowed = 0;
    for (size_t i = 0; i < sizeof(cases) / sizeof(*cases); ++i) allowed |= strcmp(argv[1], cases[i]) == 0;
    REQUIRE(allowed);
    const char *root = argv[2];
    REQUIRE(strlen(root) == 26 && strncmp(root, "/tmp/mtsandbox-", 15) == 0 && strcmp(root + 21, "/root") == 0);
    for (int i = 15; i < 21; ++i) REQUIRE((root[i] >= 'a' && root[i] <= 'z') ||
        (root[i] >= 'A' && root[i] <= 'Z') || (root[i] >= '0' && root[i] <= '9'));
    char canary[32];
    REQUIRE(snprintf(canary, sizeof(canary), "%.21s/source", root) == 28);
    uid_t uid = getuid();
    gid_t gid = getgid();
    REQUIRE(uid != 0 && gid != 0 && uid == geteuid() && gid == getegid());
    REQUIRE(syscall(SYS_close_range, 6, UINT_MAX, 0) == 0);
    REQUIRE(close(0) == 0 && close(3) == 0);
    REQUIRE(write(4, "0", 1) == 1 && close(4) == 0);
    REQUIRE(prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) == 0);
    limit(RLIMIT_CORE, 0);
    limit(RLIMIT_AS, 128 * MIB);
    sigset_t alarms;
    REQUIRE(sigemptyset(&alarms) == 0 && sigaddset(&alarms, SIGALRM) == 0);
    REQUIRE(sigprocmask(SIG_UNBLOCK, &alarms, NULL) == 0);
    REQUIRE(signal(SIGALRM, SIG_DFL) != SIG_ERR);
    REQUIRE(alarm(6) == 0);

    struct stat before[sizeof(namespaces) / sizeof(*namespaces)];
    struct stat original;
    REQUIRE(stat(canary, &original) == 0 && S_ISREG(original.st_mode));
    for (size_t i = 0; i < sizeof(namespaces) / sizeof(*namespaces); ++i) REQUIRE(stat(namespaces[i], &before[i]) == 0);
    enter_namespaces(uid, gid);
    int parent_liveness[2];
    REQUIRE(pipe2(parent_liveness, O_CLOEXEC) == 0);
    pid_t child = fork();
    REQUIRE(child >= 0);
    if (child > 0) {
        REQUIRE(close(5) == 0 && close(parent_liveness[0]) == 0);
        int status;
        REQUIRE(waitpid(child, &status, 0) == child);
        if (WIFEXITED(status)) return WEXITSTATUS(status);
        if (WIFSIGNALED(status) && WTERMSIG(status) == SIGKILL && strcmp(argv[1], "cpu") == 0) return 74;
        return 125;
    }
    // The writer lives only in the outer supervisor. Detect death before or after
    // installing the kernel parent-death signal, even when getppid() is zero here.
    REQUIRE(close(parent_liveness[1]) == 0);
    REQUIRE(prctl(PR_SET_PDEATHSIG, SIGKILL, 0, 0, 0) == 0);
    struct pollfd parent = { parent_liveness[0], POLLIN, 0 };
    REQUIRE(poll(&parent, 1, 0) == 0 && close(parent_liveness[0]) == 0);
    enter_private_root(root, before);
    limit(RLIMIT_CPU, 1);
    restrict_syscalls();
    check_isolation(canary, strcmp(argv[1], "isolation") == 0);
    challenge(argv[1]);
    return 0;
}
