"""Enumerated Linux service-only owner and descriptor-probe. No general runner."""
import fcntl
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time


def inventory():
    result = []
    for name in os.listdir("/proc/self/fd"):
        try:
            fd = int(name)
            st = os.fstat(fd)
            result.append({"fd": fd, "device": str(st.st_dev), "inode": str(st.st_ino),
                           "cloexec": bool(fcntl.fcntl(fd, fcntl.F_GETFD) & fcntl.FD_CLOEXEC),
                           "regular": stat.S_ISREG(st.st_mode)})
        except OSError:
            pass  # The directory-enumeration descriptor has already closed.
    return result


def emit(value):
    print(json.dumps(value, separators=(",", ":")), flush=True)


def identity():
    with open("/proc/sys/kernel/random/boot_id", encoding="ascii") as handle:
        boot = handle.read(100).strip()
    with open("/proc/self/stat", encoding="ascii") as handle:
        start = handle.read(4096).rsplit(")", 1)[1].split()[19]
    return {"pid": os.getpid(), "ppid": os.getppid(), "bootHash": hashlib.sha256(boot.encode()).hexdigest(), "start": start}


def read_message():
    line = sys.stdin.buffer.readline(4097)
    if not line or len(line) > 4096 or not line.endswith(b"\n"):
        raise ValueError("INPUT_LIMIT")
    value = json.loads(line)
    if not isinstance(value, dict):
        raise ValueError("INPUT")
    return value


if sys.argv[1:] == ["--descriptor-probe"]:
    emit({"event": "probe", "identity": identity(), "fds": inventory()})
    sys.exit(0)
if sys.argv[1:]:
    raise SystemExit("unsupported entry point")

root_fd = guard_fd = blob_fd = None
sealed = False
locked = False
reader_used = False
writer_used = False
probe_used = False
setup = None
count = 0
started = time.monotonic()


def guard_identity():
    current = os.stat("GUARD", dir_fd=root_fd, follow_symlinks=False)
    pinned = os.fstat(guard_fd)
    expected = setup["guard"]
    if not stat.S_ISREG(current.st_mode) or current.st_nlink != 1 or pinned.st_nlink != 1:
        raise ValueError("GUARD_IDENTITY")
    if any(str(getattr(s, key)) != expected[field] for s in (current, pinned)
           for key, field in (("st_dev", "device"), ("st_ino", "inode"))):
        raise ValueError("GUARD_IDENTITY")


def close_io():
    global blob_fd, guard_fd, root_fd, locked, sealed
    sealed = True  # Revoke future opens before closing the original descriptors.
    for name in ("blob_fd", "guard_fd", "root_fd"):
        fd = globals()[name]
        if fd is not None:
            os.close(fd)
            globals()[name] = None
    locked = False


try:
    setup = read_message()
    if set(setup) != {"root", "rootIdentity", "guard", "marker", "owner", "generation"}:
        raise ValueError("SETUP")
    if not isinstance(setup["owner"], str) or not re.fullmatch(r"owner-[a-f0-9-]{36}", setup["owner"]):
        raise ValueError("OWNER")
    if type(setup["generation"]) is not int or not 1 <= setup["generation"] <= 1000000:
        raise ValueError("GENERATION")
    root = setup["root"]
    if not isinstance(root, str) or not root.startswith("/tmp/movie-translator-m806p0-") or os.path.realpath(root) != root:
        raise ValueError("ROOT")
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    root_stat = os.fstat(root_fd)
    if str(root_stat.st_dev) != setup["rootIdentity"]["device"] or str(root_stat.st_ino) != setup["rootIdentity"]["inode"]:
        raise ValueError("ROOT_IDENTITY")
    marker_fd = os.open("OWNED.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root_fd)
    try:
        marker_stat = os.fstat(marker_fd)
        if not stat.S_ISREG(marker_stat.st_mode) or marker_stat.st_nlink != 1 or marker_stat.st_size > 4096:
            raise ValueError("MARKER")
        if json.loads(os.read(marker_fd, 4096)) != setup["marker"]:
            raise ValueError("MARKER")
    finally:
        os.close(marker_fd)
    guard_fd = os.open("GUARD", os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root_fd)
    guard_identity()
    emit({"event": "ready", "identity": identity(), "owner": setup["owner"], "generation": setup["generation"], "fds": inventory()})
    for count in range(64):
        command = read_message()
        command_id = command.get("id")
        try:
            if set(command) != {"id", "op", "generation"} or type(command_id) is not int or not isinstance(command.get("op"), str):
                raise ValueError("COMMAND")
            op = command["op"]
            original_op = op
            if op in ("write-no-ack", "seal-no-ack", "probe-no-ack"):
                op = op.removesuffix("-no-ack")
            if type(command["generation"]) is not int or command["generation"] != setup["generation"]:
                raise ValueError("STALE_GENERATION")
            if time.monotonic() - started > 15:
                raise ValueError("LIFETIME")
            if op not in ("status", "seal", "exit") and sealed:
                raise ValueError("SEALED")
            if op == "lock":
                guard_identity()
                if locked:
                    raise ValueError("ALREADY_LOCKED")
                try:
                    fcntl.flock(guard_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise ValueError("BUSY") from None
                guard_identity()  # Replacement before/after acquire must reject.
                locked = True
                value = {"locked": True, "fds": inventory()}
            elif op == "write":
                if not locked or writer_used:
                    raise ValueError("NO_WRITE_TICKET")
                guard_identity()
                writer_used = True
                blob_fd = os.open(setup["owner"] + ".blob", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=root_fd)
                written = os.write(blob_fd, b"PHASE0 ARBITRARY NON-MEDIA BYTES\n")
                os.fsync(blob_fd)
                value = {"written": written, "fds": inventory()}
            elif op == "read":
                if reader_used:
                    raise ValueError("NO_READ_TICKET")
                reader_used = True
                blob_fd = os.open("fixture.blob", os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root_fd)
                st = os.fstat(blob_fd)
                if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size > 4096:
                    raise ValueError("BLOB")
                value = {"readCount": len(os.read(blob_fd, 4096)), "fds": inventory()}
            elif op == "probe":
                if probe_used:
                    raise ValueError("NO_PROBE_TICKET")
                probe_used = True
                # The only descendant entry point: this same fixed file, inventory only.
                probe = subprocess.run([sys.executable, "-I", "-S", "-B", __file__, "--descriptor-probe"],
                                       stdin=subprocess.DEVNULL, capture_output=True, close_fds=False,
                                       env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, timeout=3, check=True)
                if len(probe.stdout) > 16384 or probe.stderr:
                    raise ValueError("PROBE_LIMIT")
                value = {"probe": json.loads(probe.stdout), "fds": inventory()}
            elif op == "seal":
                close_io()
                value = {"closed": True, "noFutureIO": True, "fds": inventory()}
            elif op == "status":
                if locked:
                    guard_identity()
                value = {"sealed": sealed, "locked": locked, "fds": inventory()}
            elif op == "exit":
                close_io()
                emit({"id": command_id, "ok": True, "value": {"closed": True}})
                break
            else:
                raise ValueError("UNSUPPORTED_COMMAND")
            if original_op in ("write-no-ack", "seal-no-ack", "probe-no-ack"):
                emit({"event": "cut", "code": original_op, "fds": inventory()})
            else:
                emit({"id": command_id, "ok": True, "value": value})
        except (ValueError, OSError) as error:
            emit({"id": command_id, "ok": False, "code": str(error) if isinstance(error, ValueError) else "IO_DENIED"})
except (ValueError, OSError, KeyError) as error:
    emit({"event": "blocked", "code": str(error) if isinstance(error, ValueError) else "OWNERSHIP"})
    sys.exit(2)
finally:
    close_io()
