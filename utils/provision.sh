#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-}"

if [[ -z "$HOST" ]]; then
   echo "Must specify host (for example, root@<engine ip>)"
   exit 1
fi

ssh "$HOST" "bash -s" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# sshd uses the first value it reads, so this file wins over later ones such as 50-cloud-init.conf.
cat > /etc/ssh/sshd_config.d/00-keys-only.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
sshd -t
systemctl reload ssh

apt-get update
apt-get -y install nginx

# Retries nginx when it fails to start, such as when DNS isn't answering yet (after a reboot or a resolver upgrade) and an upstream hostname can't be resolved.
mkdir -p /etc/systemd/system/nginx.service.d
printf '[Service]\nRestart=on-failure\nRestartSec=5s\n' > /etc/systemd/system/nginx.service.d/override.conf
systemctl daemon-reload

cat > /usr/local/sbin/refresh.sh <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
exec >> /var/log/refresh.log 2>&1
export DEBIAN_FRONTEND=noninteractive

echo "Refresh started at $(date -u)"
apt-get update
apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold --with-new-pkgs upgrade
apt-get -y autoremove
apt-get clean
echo "Refresh done at $(date -u), rebooting"
systemctl reboot
SCRIPT
chmod 755 /usr/local/sbin/refresh.sh

timedatectl set-timezone Etc/UTC
printf '0 8 * * 0 root /usr/local/sbin/refresh.sh\n' > /etc/cron.d/refresh
chmod 644 /etc/cron.d/refresh

apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold --with-new-pkgs upgrade
apt-get -y autoremove
apt-get clean
shutdown -r now
REMOTE
