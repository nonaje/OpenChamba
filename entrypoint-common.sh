#!/usr/bin/env bash
setup_ssh() {
  mkdir -p "${HOME}/.ssh"
  chmod 700 "${HOME}/.ssh"

  if [[ ! -s "${HOME}/.ssh/id_ed25519" ]]; then
    ssh-keygen -q -t ed25519 -f "${HOME}/.ssh/id_ed25519" -N "" -C "OpenChamba"
    chmod 600 "${HOME}/.ssh/id_ed25519"
    chmod 644 "${HOME}/.ssh/id_ed25519.pub"
  fi

  if [[ -d "${HOME}/.ssh" ]]; then
    find "${HOME}/.ssh" -type d -exec chmod 700 {} +
    find "${HOME}/.ssh" -type f -name "*.pub" -exec chmod 644 {} +
    find "${HOME}/.ssh" -type f \( -name "known_hosts" -o -name "authorized_keys" \) -exec chmod 644 {} +
    find "${HOME}/.ssh" -type f -name "config" -exec chmod 600 {} +
    find "${HOME}/.ssh" -type f ! -name "*.pub" ! -name "known_hosts" ! -name "authorized_keys" ! -name "config" -exec chmod 600 {} +
  fi
}
