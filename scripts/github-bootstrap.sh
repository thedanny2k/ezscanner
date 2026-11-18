#!/usr/bin/env bash
# Turns ROADMAP.md into GitHub labels, milestones and issues so the project's progress is
# visible on GitHub. Run ONCE from the repo folder (running again duplicates the issues):
#
#   gh auth login                     # once, if you haven't
#   bash scripts/github-bootstrap.sh
#
# Needs the GitHub CLI: https://cli.github.com
set -euo pipefail

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Setting up $repo"

label() { gh label create "$1" --color "$2" --description "$3" --force >/dev/null; }
milestone() {
  gh api "repos/$repo/milestones" -f title="$1" -f description="$2" >/dev/null 2>&1 || echo "  (milestone '$1' already exists)"
}
issue() { gh issue create --title "$1" --body "$2" --milestone "$3" --label "$4" >/dev/null && echo "  + $1"; }

echo "Labels"
label data        1d76db "Price providers, storage, Supabase"
label recognition 5319e7 "AI, double-check, OCR, matching"
label ui          fbca04 "Screens and interactions"
label infra       0e8a16 "CI, deploys, Edge Functions"
label eval        d93f0b "Benchmarks and accuracy"
label docs        c5def5 "README, devlog, decisions"

echo "Milestones"
milestone "v0.3 Team data and keys" "Real-phone test, verified price source, Supabase sign-in and sync, keys off phones"
milestone "v0.4 Field test"         "100-card benchmark and a real lot with the team"
milestone "v1.0 Portfolio"          "Demo mode, README results, video, release"

echo "Issues"
issue "First real-phone test: 20 cards with a real key" "Scan 20 mixed cards (holo, reverse holo, vintage, sleeved). Log every miss as a bug with the photo. Record cost from the Claude Console." "v0.3 Team data and keys" eval
issue "Verify TCGdex against the live API" "Check price freshness, every version (normal/holo/reverse/1st ed.), and search by name + number on 20 known cards. Replace tests/fixtures/tcgdex-card.json with a real response." "v0.3 Team data and keys" data
issue "Choose the default price provider" "TCGdex if it passed the check; otherwise Scrydex behind an Edge Function. Record it in docs/decisions." "v0.3 Team data and keys" data
issue "Create the Supabase project and team" "Follow docs/supabase-setup.md steps 1-5; fill in src/config.js." "v0.3 Team data and keys" infra
issue "Sign-in screen (email magic link)" "Sign in, show which team you're on, sign out." "v0.3 Team data and keys" ui
issue "Supabase storage adapter with offline copy and live sync" "Implement src/storage/supabase.js; keep an IndexedDB copy; retry writes when back online; Realtime updates between phones." "v0.3 Team data and keys" data
issue "Deploy the identify Edge Function and remove the on-phone key" "Set ANTHROPIC_API_KEY as a secret, deploy, switch main.js to edgeTransport, remove the key field from Settings (ends decision 0006)." "v0.3 Team data and keys" infra
issue "100-card benchmark" "Fill eval/testset.csv; run Sonnet, Haiku, text reader and Collectr; publish the table in the README." "v0.4 Field test" eval
issue "Field test on a real lot" "Use it with the team, file a bug for every miss." "v0.4 Field test" eval
issue "Pick the default model and double-check mode from the numbers" "Sonnet vs Haiku; every scan vs only when unsure. Record it in docs/decisions." "v0.4 Field test" recognition
issue "Demo mode, README results and video" "Sample lot for visitors; results table; screenshots; 30-second video; GitHub release." "v1.0 Portfolio" docs

echo "Done. See: https://github.com/$repo/issues"
