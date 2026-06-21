# branchbox 開発メモ（ブログ素材）

> ブログ本体とは別の、ネタ出し用メモ。**ツール本体は英語で統一**しているが、この
> ファイルは日本語の技術ブログのための素材なので日本語で書く。

---

## 1. 出発点 — なぜ作ったか

### きっかけ
最初のテーマは「**Claude Code を [apple/container](https://github.com/apple/container)
の上で、安全に・ストレスなく使う**」というブログを書きたい、というものだった。
土台として、`claude --dangerously-skip-permissions` を egress allowlist で固めた
コンテナ（iptables / ipset で外向き通信を Anthropic API・npm・GitHub などに限定）で
動かすところまではできていた。

### 「Claude を動かす」から「apple/container ならではの旨味」へ
「コンテナで Claude を動かす」設定の細部（firewall や entrypoint の調整）は、
ブログのネタとしては地味だった。そこで発想を変え、**apple/container 固有の強み**に
焦点を移した：

- apple/container は **コンテナ1つごとに軽量VMを立てる**（Docker Desktop のような
  共有VM内 namespace 分離ではない）。
- macOS 26 (Tahoe) では **コンテナごとに専用IP** が割り当たり、**ローカルDNS**で
  名前解決できる。

この「IPを細かく分けられる」性質を主役にしよう、と方針転換。さらに具体化して
たどり着いたのが **branchbox**：

> **`claude --worktree` での並行開発向けに、git worktree（ブランチ）ごとに
> ブランチ名のドメインを持つ隔離 preview 環境を生やすツール。**

```
feat-login   -> http://feat-login.internal:3000
fix-cart     -> http://fix-cart.internal:3000   # 同じ 3000 でも衝突しない（専用IP）
```

### 設計の4原則
1. **ブランチ名 = ドメイン**（専用IP + ローカルDNS、ポート公開・衝突なし）
2. **プロダクト非侵襲**（対象リポジトリに `Dockerfile` も `container` の記述も不要）
3. **Docker前提に依存しない**（コンテナ化の有無は無関係）
4. **ホットリロード対応**

---

## 2. 検証環境（ファクト）

- macOS **26.5.1 (Tahoe)** / Apple Silicon
- apple/container CLI **1.0.0**
- 既定ネットワーク `default` = `192.168.64.0/24`（各コンテナがこの中の専用IPを取得）
- host → コンテナIP へ **直接到達可能**（`ping` 実測 **約0.6ms**、`-p` ポート公開は不要）

---

## 3. つまずきと発見（ブログの“見せ場”候補）

### 3.1 ローカルDNSは「2つの設定」が要る（`--dns-domain` は罠）
`sudo container system dns create internal` だけでは `feat-x.internal` が解決
**できなかった**。公式ドキュメントを当たって判明した正しい仕組み：

- `container system dns create internal` … host 側 `/etc/resolver` に
  `*.internal` を apple/container の DNS（`127.0.0.1:2053`）へ向ける設定を作る。
- **コンテナの登録先は「デフォルトドメイン」** で、これは
  `~/.config/container/config.toml` の `[dns] domain = "internal"` で決まる。
  `container run --dns-domain` フラグでは登録**されない**。

→ 「検証スクリプトやフラグが正しくても、登録の仕組みを取り違えると解決しない」典型。
branchbox は URL 用ドメインを config の既定ドメインから**自動参照**するようにして
取りこぼしを防いだ。

### 3.2 ドメイン選び — 意味があって安全なTLD
「意味のある既定ドメイン」を選ぶとき、**意味はあるが危険**なTLDがある：

- `.dev` / `.app` … Google の**実在gTLD**かつ HSTS preload 済み →
  ブラウザが**HTTPSを強制** → `http://...:3000` が開けない。致命的。
- `.local` … macOS の **mDNS/Bonjour 専用** → 衝突。

安全な予約TLD（`.test` / `.internal` / `.localhost` / `home.arpa`）の中から、
**ICANN が2024年に内部利用専用として正式予約した `.internal`** を採用。意味が合致し、
実在TLDになることがない。

### 3.3 ext4 volume の `lost+found` で install がスキップされる
node_modules を「host と共有しない専用 volume」に分離したところ、初回に
`nodemon: not found` で落ちた。原因は **apple/container の volume が ext4 で
`lost+found` を必ず含む** ため、「node_modules が空なら install」という判定が
常に偽になっていた。マーカファイル方式（`package.json`/lockfile が更新されたら
再install、`set -e` 下でも安全な if 文）に修正。

### 3.4 native module の ABI 不一致
host(macOS) の `node_modules` をそのままマウントすると、container(linux/arm64) と
**ネイティブモジュールの ABI が食い違って壊れる**。→ node_modules を
**コンテナ専用 volume** に隔離し、初回に中で install。host 側は空のマウント点のみ。

### 3.5 VM境界をまたぐファイル監視
host の編集イベント（fsevents）が VM 内の watcher に届かず**ホットリロードが
効かない**ことがある。→ `CHOKIDAR_USEPOLLING` などポーリング系の環境変数を注入。

### 3.6 dev server は `0.0.0.0` bind 必須
`127.0.0.1` だとコンテナIP経由で届かない。`HOST=0.0.0.0` を注入（ただし Vite 等は
dev script 側に `--host` が要る場合がある、という注意点も残る）。

### 3.7 「fail-closed」は呼び出し側で台無しになる（最初の sandbox での学び）
egress allowlist スクリプトは「example.com に到達できたら exit 1」と自己検証して
いたのに、呼び出し側 entrypoint が **パイプ（`pipefail` なし）+ `|| true`** で
その終了コードを握り潰しており、firewall 構築が失敗してもコンテナが起動してしまう
状態だった。**安全機構は、検証ロジックが正しくても呼び出し側で無効化され得る**、
という汎用的な教訓。

### 3.8 in-place 実行の副作用
リポジトリ上で直接 preview すると、`npm install` が `package-lock.json` を、
volume マウントが空の `node_modules/` をワークツリーに残す。`.gitignore` で吸収。

---

## 4. アーキテクチャ（最終形）

```
branchbox            # CLI（up/down/url/list/gc、ブランチ→slug、コマンド自動検出 or 明示）
runtime/Dockerfile   # 汎用ランタイム（toolchain のみ。entrypoint は焼かない）
runtime/dev-entry.sh # 実行時に bind-mount され、toolchain準備→install→devコマンド exec
.claude/skills/branchbox/  # Claude Code 用 /branchbox skill
examples/hello-web/  # 動作確認用の最小 Express アプリ
```

### CLI インターフェースの変遷
- 当初：`branchbox up [dir]`（ディレクトリを位置引数、コマンドは自動検出）。
- 変更：**ディレクトリは `--dir` オプション、位置引数は実行コマンド**に。
  「dev コマンドはプロジェクトごとに様々／モノレポは複数」という現実に合わせた。
  - `--name LABEL` で slug に `-LABEL` を付加 → **1ブランチに複数 preview**
    （`feat-login-web` / `feat-login-api`）。ブランチ identity を保ちつつ衝突回避。

### dev-entry の「注入」方式（custom Dockerfile 対応の肝）
当初は dev-entry.sh を **イメージに ENTRYPOINT として焼き込み**、それが install/exec を
担っていた。これだと「任意の Dockerfile を指定」したときに branchbox の便利機能が
効かない。そこで **dev-entry をイメージから外し、毎回 bind-mount で注入**する形に
変更：

```
container run ... \
  -v "<repo>/runtime/dev-entry.sh:/branchbox/dev-entry.sh:ro" \
  "<image>"  sh /branchbox/dev-entry.sh  sh -lc "<dev command>"
```

これにより：
- `branchbox up --dockerfile ./Dockerfile.preview …` で**任意のランタイムイメージ**を
  使える（ユーザの Dockerfile は `FROM node:22-slim` + 必要な apt だけ。branchbox
  固有の記述ゼロ）。イメージは**内容ハッシュでタグ付け**して on-demand ビルド
  （変更なければキャッシュヒット）。
- 既定イメージは初回利用時に**自動ビルド**。
- `BRANCHBOX_IMAGE=node:20` のような**素の公開イメージ**でもそのまま動く。

---

## 5. 検証ファクト（実機ログ要約）

すべて macOS 26.5.1 / container 1.0.0 で実機確認：

| 項目 | 結果 |
|------|------|
| 既定ランタイムで up | `http://verify-demo.internal:3000/api/info` が JSON を返す。`branch` フィールドは `os.hostname()`（= コンテナ名 = slug）を表示 |
| host→コンテナIP 到達 | `ping` 約0.6ms、`-p` なしで直接到達 |
| ホットリロード | host で `server.js` を編集 → ポーリング watcher が再起動 → `RELOADED` が反映 |
| モノレポ（`--name`） | 同一ブランチに `verify-demo` と `verify-demo-api` が共存、別URL |
| `--dockerfile` カスタム | `branchbox-img-<contenthash>` をビルド、コンテナ内マーカ `/etc/branchbox-marker` で**カスタムイメージ使用を確認**、dev-entry注入で install→配信もOK |
| `down` / `gc` | コンテナ + node_modules volume を削除。`gc` は worktree が消えた preview を自動回収。残骸ゼロ |

> 補足：`.internal` の名前解決には一度きりの `sudo container system dns create internal`
> ＋ config.toml の既定ドメイン設定が必要（§3.1）。未設定でも各コンテナの専用IP直
> アクセスで等価に動作する。

---

## 6. 配布の検討

- `vercel-labs/skills`（npm `skills`、`npx skills add owner/repo`）は
  `.claude/skills/<name>/SKILL.md` を自動検出してインストールできる。branchbox の
  skill は形式（`name`/`description` frontmatter、標準配置）を満たすので**機構上は
  インストール可能**。
- ただし skill は `branchbox` CLI を呼ぶ**薄いラッパ**なので、skill 単体では完結
  しない。当面は **`~/.claude/skills` へシンボリックリンク**＋CLI を PATH に置く方式を
  README に記載。
- 本格配布するなら CLI を npm パッケージ化し、skill から起動する形に自己完結化する。

---

## 7. 今後の展望（ブログの締め向け）

- **ミニスタック化**：worktree ごとに専用ネットワークを切り、`web` + `db`(+`redis`) を
  別コンテナで。「ブランチAのマイグレーションがブランチBを壊さない」完全分離。
  apple/container の per-container IP がもっとも活きる方向。
- **ダッシュボード**：全 preview（ブランチ名・URL・状態）を列挙する index を
  `dash.internal` に常駐。
- **Claude 自己検証ループ**：編集後に skill が `curl $(branchbox url)` で自分の
  preview を取得し、表示崩れを確認。「コンテナで Claude を動かす」ではなく
  「**Claude が preview を使って自分の変更を検証する**」という閉ループ。
- **多言語ツールチェーン**：`mise` で `.tool-versions`/`.nvmrc` を読み、
  ブランチごとに別ランタイム（Node 18 と 22 を host で切り替える地獄を解消）。
- **配布**：CLI の npm 化と skill の自己完結化。
- **既知の課題**：lockfile を持たないプロジェクトで `npm install` が
  `package-lock.json` を生成する非侵襲性の綻び（`--no-package-lock` 等で対応余地）。

---

## 8. セキュリティの視点（オプションの章）

apple/container は **コンテナごとに軽量VM** を立てるため、Docker の「共有カーネル＋
namespace」より分離が強い。`--dangerously-skip-permissions` のような“暴れ得る”
エージェントを動かすとき、

- **VM分離** = ホスト(Mac)を守る（乗っ取られてもハイパーバイザの壁で封じ込め）
- **egress allowlist** = データ/認証情報の流出を防ぐ

という**直交した2層**で守れる、という多層防御の話につなげられる。branchbox 自体は
preview ツールだが、同じ apple/container 基盤の「分離が強い」という性質を共有する。
```
