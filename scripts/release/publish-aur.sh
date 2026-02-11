#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-}"
if [[ -z "${TAG}" ]]; then
  echo "Usage: $0 <release-tag>" >&2
  exit 1
fi

if [[ "${TAG}" == *-* ]]; then
  echo "Skipping AUR publish for prerelease tag: ${TAG}"
  exit 0
fi

VERSION="${TAG#v}"
if [[ -z "${VERSION}" || "${VERSION}" == "${TAG}" ]]; then
  echo "Expected a tag starting with 'v' (got: ${TAG})" >&2
  exit 1
fi

REPO="${GITHUB_REPOSITORY:-sayedhfatimi/object0}"
AUR_PACKAGE="${AUR_PACKAGE:-object0-bin}"
ASSET_NAME="object0_${VERSION}_linux_x64_installer.deb"
ASSET_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"
PKG_SOURCE_TEMPLATE="https://github.com/${REPO}/releases/download/v\${pkgver}/object0_\${pkgver}_linux_x64_installer.deb"
SRCINFO_SOURCE_URL="https://github.com/${REPO}/releases/download/v${VERSION}/object0_${VERSION}_linux_x64_installer.deb"

echo "Downloading release asset: ${ASSET_URL}"
curl --fail --location --silent --show-error "${ASSET_URL}" --output "${ASSET_NAME}"
SHA256="$(sha256sum "${ASSET_NAME}" | awk '{print $1}')"
echo "Computed SHA256: ${SHA256}"

WORKDIR="$(mktemp -d)"
cleanup() {
  rm -rf "${WORKDIR}"
}
trap cleanup EXIT

git clone "ssh://aur@aur.archlinux.org/${AUR_PACKAGE}.git" "${WORKDIR}/${AUR_PACKAGE}"
cd "${WORKDIR}/${AUR_PACKAGE}"

sed -i -E "s/^pkgver=.*/pkgver=${VERSION}/" PKGBUILD
sed -i -E "s/^pkgrel=.*/pkgrel=1/" PKGBUILD
sed -i -E "s|^source_x86_64=.*|source_x86_64=(\"object0-\${pkgver}.deb::${PKG_SOURCE_TEMPLATE}\")|" PKGBUILD
sed -i -E "s/^sha256sums_x86_64=.*/sha256sums_x86_64=('${SHA256}')/" PKGBUILD

sed -i -E "s|^[[:space:]]*pkgver = .*|\tpkgver = ${VERSION}|" .SRCINFO
sed -i -E "s|^[[:space:]]*pkgrel = .*|\tpkgrel = 1|" .SRCINFO
sed -i -E "s|^[[:space:]]*source_x86_64 = .*|\tsource_x86_64 = object0-${VERSION}.deb::${SRCINFO_SOURCE_URL}|" .SRCINFO
sed -i -E "s|^[[:space:]]*sha256sums_x86_64 = .*|\tsha256sums_x86_64 = ${SHA256}|" .SRCINFO

git config user.name "${GITHUB_ACTOR:-github-actions[bot]}"
git config user.email "${GITHUB_ACTOR:-github-actions[bot]}@users.noreply.github.com"

git add PKGBUILD .SRCINFO
if git diff --cached --quiet; then
  echo "No AUR changes to publish"
  exit 0
fi

git commit -m "chore: update ${AUR_PACKAGE} to ${VERSION}"
git push origin HEAD

echo "Published ${AUR_PACKAGE} ${VERSION} to AUR"
