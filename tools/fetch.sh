#!/usr/bin/env bash
# 公式ファイルの取得スクリプト(GR1 指示書 3 章)。
# vendor/ の下に、SysML-v2-Release(タグ 2026-03・2026-08)の必要な部分と、
# SysML-v2-Pilot-Implementation(タグ 2026-03)の全体を取得する。
# 何度実行しても同じ結果になる。既に正しいタグのコミットが取得済みなら取り直さない。
# 取得したコミットのハッシュを reports/GR1/P1_fetch_$(hostname).md に記録する。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR="$ROOT/vendor"
REPORT="$ROOT/reports/GR1/P1_fetch_$(hostname).md"
RELEASE_URL="https://github.com/Systems-Modeling/SysML-v2-Release.git"
PILOT_URL="https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation.git"

mkdir -p "$VENDOR"

# タグが指すコミットのハッシュ(注釈付きタグなら剥がした先)を返す。
remote_commit() {
  local url="$1" tag="$2" line
  line="$(git ls-remote "$url" "refs/tags/$tag^{}")"
  [ -n "$line" ] || line="$(git ls-remote "$url" "refs/tags/$tag")"
  [ -n "$line" ] || { echo "タグ $tag が $url にない" >&2; exit 1; }
  echo "${line%%[[:space:]]*}"
}

# 取得先 dest にタグ tag を取得する。paths を与えたら、その部分だけを取り出す(sparse checkout)。
fetch_tag() {
  local url="$1" tag="$2" dest="$3"; shift 3
  local want have=""
  want="$(remote_commit "$url" "$tag")"
  if [ -d "$dest/.git" ]; then
    have="$(git -C "$dest" rev-parse HEAD 2>/dev/null || true)"
  fi
  if [ "$have" != "$want" ]; then
    rm -rf "$dest"
    if [ "$#" -gt 0 ]; then
      git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$tag" --filter=blob:none --no-checkout "$url" "$dest"
    else
      git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$tag" "$url" "$dest"
    fi
  fi
  if [ "$#" -gt 0 ]; then
    git -C "$dest" sparse-checkout set --no-cone "$@"
    git -C "$dest" checkout --quiet "$want"
  fi
  have="$(git -C "$dest" rev-parse HEAD)"
  [ "$have" = "$want" ] || { echo "$dest のコミット $have がタグ $tag の $want と違う" >&2; exit 1; }
  echo "$have"
}

R03="$(fetch_tag "$RELEASE_URL" 2026-03 "$VENDOR/release-2026-03" \
  /sysml/src/ /sysml.library/ /bnf/ \
  /doc/1-Kernel_Modeling_Language.pdf /doc/2a-OMG_Systems_Modeling_Language.pdf)"
R08="$(fetch_tag "$RELEASE_URL" 2026-08 "$VENDOR/release-2026-08" \
  /doc/1-Kernel_Modeling_Language.pdf /doc/2a-OMG_Systems_Modeling_Language.pdf)"
P03="$(fetch_tag "$PILOT_URL" 2026-03 "$VENDOR/pilot")"

# 取得後の検査(指示書 3 章)。結果を表にし、1 つでも一致しなければ終了コード 1。
FAIL=0
CHECKS=""
check() {  # 項目 期待値 実際の値
  local mark="一致"
  if [ "$2" != "$3" ]; then mark="**不一致**"; FAIL=1; fi
  CHECKS+="| $1 | $2 | $3 | $mark |"$'\n'
}
count() { find "$1" -name "*.$2" -type f | wc -l | tr -d ' '; }
# 表紙(1 ページ目)の版と文書番号を 1 行にまとめる。
cover() {
  pdftotext -l 1 -layout "$1" - | grep -E '^\s*(Version|OMG Document Number:)' \
    | sed -E 's/^\s+//; s/\s+$//' | paste -sd ';' -
}
R="$VENDOR/release-2026-03"
check "release-2026-03 sysml/src の .sysml" 251 "$(count "$R/sysml/src" sysml)"
check "release-2026-03 sysml.library の .sysml" 58 "$(count "$R/sysml.library" sysml)"
check "release-2026-03 sysml.library の .kerml" 36 "$(count "$R/sysml.library" kerml)"
check "release-2026-03 KerML PDF の表紙" "Version 1.0;OMG Document Number: formal/2026-03-01" \
  "$(cover "$R/doc/1-Kernel_Modeling_Language.pdf")"
check "release-2026-03 SysML PDF の表紙" "Version 2.0;OMG Document Number: formal/2026-03-02" \
  "$(cover "$R/doc/2a-OMG_Systems_Modeling_Language.pdf")"
check "release-2026-08 KerML PDF の表紙" "Version 1.1 Beta 2;OMG Document Number: None" \
  "$(cover "$VENDOR/release-2026-08/doc/1-Kernel_Modeling_Language.pdf")"
check "release-2026-08 SysML PDF の表紙" "Version 2.1 Beta 2;OMG Document Number: None" \
  "$(cover "$VENDOR/release-2026-08/doc/2a-OMG_Systems_Modeling_Language.pdf")"

mkdir -p "$(dirname "$REPORT")"
cat > "$REPORT" <<EOF
# GR1 P1 公式ファイルの取得

- 機体: $(hostname)
- 取得スクリプト: \`bash tools/fetch.sh\`

| 取得元 | タグ | コミット | 取得先 |
|---|---|---|---|
| SysML-v2-Release | 2026-03 | \`$R03\` | \`vendor/release-2026-03/\` |
| SysML-v2-Release | 2026-08 | \`$R08\` | \`vendor/release-2026-08/\` |
| SysML-v2-Pilot-Implementation | 2026-03 | \`$P03\` | \`vendor/pilot/\` |

## 取得後の検査

| 項目 | 期待値 | 実際 | 結果 |
|---|---|---|---|
${CHECKS}
EOF
echo "取得完了: release-2026-03=$R03 release-2026-08=$R08 pilot=$P03"
if [ "$FAIL" -ne 0 ]; then
  echo "取得後の検査に不一致がある。$REPORT を見よ" >&2
  exit 1
fi
echo "取得後の検査: すべて一致"
