#!/usr/bin/env bash
set -Eeuo pipefail

readonly REPOSITORY='GitWorkbench/workbench'
readonly RELEASES_URL="https://github.com/$REPOSITORY/releases/latest/download"
readonly OS_RELEASE_FILE="${GIT_WORKBENCH_OS_RELEASE_FILE:-/etc/os-release}"

fail() {
  printf 'Git Workbench installer: %s\n' "$*" >&2
  exit 1
}

for utility in curl awk sha512sum base64 od tr mktemp chmod; do
  command -v "$utility" >/dev/null 2>&1 || fail "Required command not found: $utility"
done

[[ -r "$OS_RELEASE_FILE" ]] || fail 'Cannot read /etc/os-release to identify this Linux distribution.'
# shellcheck disable=SC1090
. "$OS_RELEASE_FILE"

distribution_id=$(printf '%s' "$ID" | tr '[:upper:]' '[:lower:]')
distribution_like=$(printf '%s' "${ID_LIKE:-}" | tr '[:upper:]' '[:lower:]')

case "$distribution_id" in
  ubuntu|debian|linuxmint|pop|elementary|zorin|kali|raspbian)
    package_format='deb'
    ;;
  arch|cachyos|manjaro|endeavouros|arcolinux)
    package_format='pacman'
    ;;
  fedora|rhel|centos|rocky|almalinux|ol)
    package_format='rpm'
    ;;
  opensuse*|sles)
    package_format='rpm'
    ;;
  *)
    case " $distribution_like " in
      *' debian '*|*' ubuntu '*) package_format='deb' ;;
      *' arch '*) package_format='pacman' ;;
      *' fedora '*|*' rhel '*|*' suse '*) package_format='rpm' ;;
      *) package_format='AppImage' ;;
    esac
    ;;
esac

machine_arch=$(uname -m)
case "$machine_arch" in
  x86_64|amd64)
    asset_arch_pattern='(x64|x86_64|amd64)'
    feed_suffix=''
    native_arch='x86_64'
    ;;
  aarch64|arm64)
    asset_arch_pattern='(arm64|aarch64)'
    feed_suffix='-arm64'
    native_arch='aarch64'
    ;;
  armv7l|armv7*)
    asset_arch_pattern='(arm|armv7l)'
    feed_suffix='-arm'
    native_arch='armv7l'
    ;;
  i386|i486|i586|i686)
    asset_arch_pattern='(ia32|i386|i486|i586|i686)'
    feed_suffix='-ia32'
    native_arch='i686'
    ;;
  *)
    fail "Unsupported CPU architecture: $machine_arch. See https://github.com/$REPOSITORY/releases."
    ;;
esac

temporary_directory=$(mktemp -d "${TMPDIR:-/tmp}/git-workbench-install.XXXXXX")
trap 'rm -rf -- "$temporary_directory"' EXIT

feed_file="$temporary_directory/latest-linux.yml"
feed_url="$RELEASES_URL/latest-linux$feed_suffix.yml"
if ! curl --fail --location --silent --show-error --retry 2 --connect-timeout 15 "$feed_url" --output "$feed_file"; then
  fail "No stable Linux release metadata is published for $machine_arch yet. See https://github.com/$REPOSITORY/releases."
fi

version=$(awk -F ': *' '$1 == "version" { print $2; exit }' "$feed_file" | tr -d '\r"')
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'The latest release metadata has an invalid version.'

case "$package_format" in
  deb|rpm|pacman|AppImage) ;;
  *) fail "Unsupported package format: $package_format" ;;
esac

asset_entry=$(
  awk -v version="$version" -v arch="$asset_arch_pattern" -v native_arch="$native_arch" -v format="$package_format" '
    function flush_entry() {
      if (selected && checksum != "") {
        print filename "\t" checksum
        count++
      }
      selected = 0
      checksum = ""
      checksum_pending = 0
    }
    /^  - url: / {
      flush_entry()
      filename = $0
      sub(/^  - url: /, "", filename)
      sub(/^"/, "", filename)
      sub(/"$/, "", filename)
      if (format == "pacman") {
        selected = filename ~ ("^git-workbench-" version "-[0-9]+([.][0-9]+)?-" native_arch "[.]pkg[.]tar[.]zst$")
      } else {
        suffix = format == "AppImage" ? "AppImage" : format
        selected = filename ~ ("^git-workbench-" version "-" arch "[.]" suffix "$")
      }
      next
    }
    selected && /^    sha512: / {
      checksum = $0
      sub(/^    sha512: */, "", checksum)
      if (checksum ~ /^>[+-]?$/ || checksum ~ /^\|[+-]?$/) {
        checksum = ""
        checksum_pending = 1
      } else {
        gsub(/[[:space:]"\047]/, "", checksum)
      }
      next
    }
    selected && checksum_pending && /^      / {
      line = $0
      sub(/^ +/, "", line)
      gsub(/[[:space:]]/, "", line)
      checksum = checksum line
      next
    }
    selected && checksum_pending && !/^      / {
      checksum_pending = 0
    }
    END {
      flush_entry()
      if (count != 1) exit 1
    }
  ' "$feed_file"
) || fail "No matching $package_format installer is attached for $machine_arch. See https://github.com/$REPOSITORY/releases."

installer_name=${asset_entry%%$'\t'*}
expected_sha512=${asset_entry#*$'\t'}
[[ "$installer_name" != "$asset_entry" && "$expected_sha512" =~ ^[A-Za-z0-9+/]{86}==$ ]] || fail 'The release feed has an invalid installer checksum.'
[[ "$installer_name" != */* && "$installer_name" != *'..'* ]] || fail 'The release feed contains an unsafe installer filename.'

installer_file="$temporary_directory/$installer_name"
installer_url="$RELEASES_URL/$installer_name"
printf 'Downloading Git Workbench %s (%s)...\n' "$version" "$installer_name"
curl --fail --location --show-error --progress-bar --retry 2 --connect-timeout 15 "$installer_url" --output "$installer_file" \
  || fail "Could not download $installer_name. See https://github.com/$REPOSITORY/releases."
printf '\n'

actual_sha512=$(sha512sum -- "$installer_file" | awk '{ print $1 }')
expected_hex=$(printf '%s' "$expected_sha512" | base64 --decode 2>/dev/null | od -An -v -tx1 | tr -d ' \n') \
  || fail 'The release feed contains an invalid SHA-512 checksum.'
[[ "$expected_hex" =~ ^[[:xdigit:]]{128}$ && "$actual_sha512" == "$expected_hex" ]] \
  || fail "SHA-512 verification failed for $installer_name; the package was not installed."

printf 'Verified Git Workbench %s for %s with SHA-512.\n' "$version" "$machine_arch"

run_privileged() {
  if [[ "$(id -u)" == '0' ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  elif command -v pkexec >/dev/null 2>&1; then
    pkexec "$@"
  else
    fail 'Install sudo or a PolicyKit authorization agent, or install this package manually.'
  fi
}

case "$package_format" in
  deb)
    if command -v apt-get >/dev/null 2>&1; then
      # APT's _apt sandbox needs to traverse the temp directory and read the
      # verified public release package; keep the directory non-writable.
      chmod 0711 "$temporary_directory"
      chmod 0644 "$installer_file"
      run_privileged apt-get install "$installer_file"
    elif command -v apt >/dev/null 2>&1; then
      chmod 0711 "$temporary_directory"
      chmod 0644 "$installer_file"
      run_privileged apt install "$installer_file"
    else
      fail 'No apt package manager was found. Install the downloaded .deb manually.'
    fi
    ;;
  rpm)
    if [[ "$distribution_id" == opensuse* || "$distribution_id" == sles ]]; then
      command -v zypper >/dev/null 2>&1 || fail 'The zypper package manager was not found.'
      run_privileged zypper install "$installer_file"
    elif command -v dnf >/dev/null 2>&1; then
      run_privileged dnf install "$installer_file"
    elif command -v yum >/dev/null 2>&1; then
      run_privileged yum localinstall "$installer_file"
    else
      fail 'No RPM package manager was found. Install the downloaded .rpm manually.'
    fi
    ;;
  pacman)
    command -v pacman >/dev/null 2>&1 || fail 'The pacman package manager was not found.'
    run_privileged pacman -U "$installer_file"
    ;;
  AppImage)
    command -v install >/dev/null 2>&1 || fail 'The install command was not found.'
    app_directory="$HOME/.local/opt/git-workbench"
    bin_directory="$HOME/.local/bin"
    applications_directory="$HOME/.local/share/applications"
    appimage_path="$app_directory/GitWorkbench.AppImage"
    mkdir -p "$app_directory" "$bin_directory" "$applications_directory"
    install -m 0755 "$installer_file" "$appimage_path"
    ln -sfn "$appimage_path" "$bin_directory/git-workbench"

    escaped_path=${appimage_path//\\/\\\\}
    escaped_path=${escaped_path//\"/\\\"}
    printf '[Desktop Entry]\nType=Application\nName=Git Workbench\nComment=A commit-graph-centric visual Git client\nExec="%s" %%U\nIcon=%s\nTerminal=false\nCategories=Development;IDE;\nStartupWMClass=git-workbench\n' \
      "$escaped_path" 'applications-development' > "$applications_directory/git-workbench.desktop"
    printf 'Installed the AppImage for this user at %s\n' "$appimage_path"
    ;;
esac

printf 'Git Workbench %s is installed.\n' "$version"
