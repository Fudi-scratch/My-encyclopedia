// ==========================================================
// HTML・CSS・JS辞典 - アプリロジック（中継API版）
// データはGitHubのJSONファイルに保存されますが、ブラウザはGitHubに直接触れず、
// Cloudflare Workers の中継API経由で読み書きします。トークンはサイト側に一切ありません。
// ==========================================================

(function () {
  "use strict";

  const API_BASE = "https://dictionary-api.ryo-use-mail-25.workers.dev";

  const SEED_ENTRIES = [
    {
      title: "<div>要素",
      category: "HTML",
      body:
        "意味を持たない、汎用のブロックレベル要素。それ自体に見た目や役割はなく、CSSでスタイルを当てたりJavaScriptで操作したりするための入れ物として使う。見出しや段落など、意味に合ったタグが他にある場合はそちらを優先するのが基本。\n\n**メモ:** 見た目の手がかりがないぶん、`class`属性や`id`属性を付けてCSS側で装飾するのが一般的な使い方。",
    },
    {
      title: "<a>要素",
      category: "HTML",
      body:
        "ハイパーリンクを作るための要素。href属性にリンク先のURLを指定する。target=\"_blank\"を指定すると別タブで開き、外部サイトへのリンクではrel=\"noopener\"を添えることが推奨される。",
    },
    {
      title: "<img>要素",
      category: "HTML",
      body:
        "画像を表示するための要素。src属性に画像のパスを、alt属性に代替テキストを指定する。alt属性は画像が読み込めなかったときの表示や、スクリーンリーダーで内容を伝える際に重要な役割を持つ。",
    },
    {
      title: "display",
      category: "CSS",
      body:
        "要素がどのようにレイアウトされるかを決めるプロパティ。blockは幅いっぱいのブロック、inlineは文章の一部のように並ぶ要素、flexやgridは子要素を柔軟に並べるレイアウトを作る。値によって要素の振る舞いが大きく変わる、レイアウトの基本となるプロパティ。\n\n代表的な値:\n- block\n- inline\n- inline-block\n- flex\n- grid\n- none\n\n例:\n```css\n.box {\n  display: flex;\n}\n```",
    },
    {
      title: "flexbox",
      category: "CSS",
      body:
        "親要素にdisplay: flexを指定して使う、要素を1方向に並べて揃えるためのレイアウト方式。justify-contentで主軸方向の揃え方を、align-itemsで交差軸方向の揃え方を指定でき、中央揃えや均等配置が少ないコードで実現できる。",
    },
    {
      title: "position",
      category: "CSS",
      body:
        "要素の配置方法を指定するプロパティ。staticが初期値で、relativeは元の位置を基準にずらせる。absoluteは直近のrelative（など）な祖先要素を基準に配置され、fixedは画面に固定、stickyはスクロールに応じて固定と通常配置を切り替える。\n\n| 値 | 配置の基準 |\n| --- | --- |\n| static | 通常の配置（初期値） |\n| relative | 自分の元の位置 |\n| absolute | 位置指定された祖先要素 |\n| fixed | ビューポート（画面） |\n| sticky | スクロール位置に応じて切り替え |",
    },
    {
      title: "addEventListener",
      category: "JavaScript",
      body:
        "要素にイベントの監視を追加するメソッド。第1引数にclickやkeydownなどのイベント名、第2引数に実行する関数を渡す。同じ要素に複数のリスナーを追加でき、onclickのようなプロパティへの代入と違って上書きされない。\n\n例:\n```js\nbutton.addEventListener(\"click\", () => {\n  console.log(\"clicked\");\n});\n```",
    },
    {
      title: "querySelector",
      category: "JavaScript",
      body:
        "CSSセレクタと同じ書き方で、条件に一致する最初の要素を取得するメソッド。document.querySelector(\".card\")のように使う。条件に一致する要素をすべて取得したいときはquerySelectorAllを使い、こちらはNodeListが返る。",
    },
    {
      title: "Promise",
      category: "JavaScript",
      body:
        "非同期処理の結果（成功か失敗か）を表すオブジェクト。処理が成功するとresolveが、失敗するとrejectが呼ばれ、thenやcatchでその結果を受け取れる。async/await構文を使うと、Promiseを使った処理を同期処理のような見た目で書くことができる。",
    },
  ];

  const CATEGORIES = ["HTML", "CSS", "JavaScript"];

  /** @type {{id:string, title:string, category:string, body:string, updatedAt:number}[]} */
  let entries = [];
  let view = { name: "home" }; // {name:'home'} | {name:'article', id} | {name:'form', mode:'add'|'edit', id?}
  let searchTerm = "";
  let activeLetter = null;
  let activeCategory = null;
  let pendingDeleteId = null;

  let loading = true;
  let loadError = false;
  let seedPending = false; // サーバーにまだファイルが無く、見本データを表示している状態
  let statusMessage = "";

  const collator = new Intl.Collator("ja");

  function makeId() {
    return "e_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---------------- 中継API ----------------

  async function apiRequest(path, options) {
    const res = await fetch(API_BASE + path, options);
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = null;
    }
    if (!res.ok) {
      const message = (data && data.error) || `通信に失敗しました（status: ${res.status}）`;
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  function seedWithIds() {
    return SEED_ENTRIES.map((e) => ({
      id: makeId(),
      title: e.title,
      category: e.category,
      body: e.body,
      updatedAt: Date.now(),
    }));
  }

  async function loadEntries() {
    loading = true;
    loadError = false;
    statusMessage = "";
    render();

    try {
      const data = await apiRequest("/entries", { cache: "no-store" });
      if (data.entries === null) {
        // まだデータファイルが無い → 見本データを表示（最初の保存時にサーバー側で作成される）
        entries = seedWithIds();
        seedPending = true;
        statusMessage = "まだ公開データがありません。最初の項目を追加・編集すると、見本データと一緒に保存されます。";
      } else {
        entries = data.entries;
        seedPending = false;
      }
    } catch (err) {
      console.error(err);
      loadError = true;
      statusMessage = "辞典のデータを読み込めませんでした。時間をおいて「最新の内容を読み込む」をお試しください。";
    }
    loading = false;
    render();
  }

  /** 項目を追加・更新する。成功すると entries がサーバーの最新状態に置き換わる。 */
  async function saveEntry(entry) {
    return writeToApi("/upsert", { entry });
  }

  async function removeEntry(id) {
    return writeToApi("/delete", { id });
  }

  async function writeToApi(path, payload) {
    const body = Object.assign({}, payload);
    if (seedPending) body.seed = entries; // ファイルが無い間だけ、見本データも一緒に送る
    try {
      const data = await apiRequest(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      entries = data.entries;
      seedPending = false;
      statusMessage = "";
      return { ok: true };
    } catch (err) {
      console.error(err);
      showToast(err.message || "保存に失敗しました");
      if (err.status === 409) {
        await loadEntries();
      }
      return { ok: false };
    }
  }

  // ---------------- Elements ----------------

  const els = {
    main: document.getElementById("main"),
    alphaRail: document.getElementById("alphaRail"),
    searchInput: document.getElementById("searchInput"),
    addBtn: document.getElementById("addBtn"),
    toast: document.getElementById("toast"),
    entryTotal: document.getElementById("entryTotal"),
    exportBtn: document.getElementById("exportBtn"),
    refreshBtn: document.getElementById("refreshBtn"),
    overlay: document.getElementById("confirmOverlay"),
    confirmMessage: document.getElementById("confirmMessage"),
    confirmCancel: document.getElementById("confirmCancel"),
    confirmOk: document.getElementById("confirmOk"),
    statusBar: document.getElementById("statusBar"),
  };

  // ---------------- Helpers ----------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // カード一覧のプレビュー用：記法の記号を取り除いた簡易プレーンテキストにする
  function plainPreview(text) {
    return String(text)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, " ")
      .replace(/^#{1,3}\s*/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^[-・]\s+/gm, "")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // 記事本文の簡易記法をHTMLに変換する。
  // 対応記法: **太字** / `インラインコード` / # 大きな文字 / - 箇条書き /
  //           ```コードブロック``` / | 表 | の形式のテーブル
  function renderBodyRich(text) {
    const lines = String(text).replace(/\r\n/g, "\n").split("\n");
    const htmlParts = [];
    let i = 0;

    function inline(line) {
      let out = escapeHtml(line);
      out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
      return out;
    }

    function isTableRow(line) {
      return /\|/.test(line.trim());
    }

    function isTableSeparator(line) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|");
      return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
    }

    function splitRow(line) {
      return line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
    }

    while (i < lines.length) {
      const line = lines[i];

      // コードブロック ```...```
      if (/^```/.test(line.trim())) {
        const trimmed = line.trim();
        const rest = trimmed.slice(3);
        const codeLines = [];
        let lang = "";

        const selfCloseMatch = rest.match(/^(.*)```$/);
        if (selfCloseMatch) {
          codeLines.push(selfCloseMatch[1]);
          i++;
        } else {
          if (rest.trim() && /^[A-Za-z0-9_+-]+$/.test(rest.trim())) {
            lang = rest.trim();
          } else if (rest.trim()) {
            codeLines.push(rest);
          }
          i++;
          while (i < lines.length) {
            const closeIdx = lines[i].indexOf("```");
            if (closeIdx !== -1) {
              const before = lines[i].slice(0, closeIdx);
              if (before) codeLines.push(before);
              i++;
              break;
            }
            codeLines.push(lines[i]);
            i++;
          }
        }

        const labelHtml = lang
          ? `<div class="body-code-label">${escapeHtml(lang.toUpperCase())}</div>`
          : "";
        htmlParts.push(
          `<div class="body-code-block${lang ? " has-label" : ""}">${labelHtml}<pre class="body-code"><code>${escapeHtml(
            codeLines.join("\n")
          )}</code></pre></div>`
        );
        continue;
      }

      // 表
      if (isTableRow(line)) {
        let j = i;
        const collected = [];
        while (j < lines.length && isTableRow(lines[j])) {
          if (!isTableSeparator(lines[j])) {
            collected.push(splitRow(lines[j]));
          }
          j++;
        }
        if (collected.length >= 2) {
          const header = collected[0];
          const rows = collected.slice(1);
          let tableHtml = '<table class="body-table"><thead><tr>';
          header.forEach((cell) => (tableHtml += `<th>${inline(cell)}</th>`));
          tableHtml += "</tr></thead><tbody>";
          rows.forEach((row) => {
            tableHtml += "<tr>";
            header.forEach((_, idx) => (tableHtml += `<td>${inline(row[idx] || "")}</td>`));
            tableHtml += "</tr>";
          });
          tableHtml += "</tbody></table>";
          htmlParts.push(tableHtml);
          i = j;
          continue;
        }
      }

      // 見出し
      const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        htmlParts.push(`<p class="body-heading body-heading-${level}">${inline(headingMatch[2])}</p>`);
        i++;
        continue;
      }

      // 箇条書き
      if (/^[-・]\s+/.test(line.trim())) {
        const items = [];
        while (i < lines.length && /^[-・]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-・]\s+/, ""));
          i++;
        }
        htmlParts.push("<ul class=\"body-list\">" + items.map((it) => `<li>${inline(it)}</li>`).join("") + "</ul>");
        continue;
      }

      if (!line.trim()) {
        i++;
        continue;
      }

      // 通常の段落
      const paraLines = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^```/.test(lines[i].trim()) &&
        !/^[-・]\s+/.test(lines[i].trim()) &&
        !/^#{1,3}\s+/.test(lines[i]) &&
        !isTableRow(lines[i])
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      htmlParts.push("<p>" + paraLines.map(inline).join("<br>") + "</p>");
    }

    return htmlParts.join("\n");
  }

  function firstChar(title) {
    return (title || "?").trim().charAt(0).toUpperCase() || "?";
  }

  function categoryClass(category) {
    if (category === "HTML") return "cat-html";
    if (category === "CSS") return "cat-css";
    if (category === "JavaScript") return "cat-js";
    return "";
  }

  function sortedEntries() {
    return [...entries].sort((a, b) => collator.compare(a.title, b.title));
  }

  function filteredEntries() {
    const term = searchTerm.trim().toLowerCase();
    let list = sortedEntries();
    if (term) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          (e.body || "").toLowerCase().includes(term) ||
          (e.category || "").toLowerCase().includes(term)
      );
    }
    if (activeLetter) {
      list = list.filter((e) => firstChar(e.title) === activeLetter);
    }
    if (activeCategory) {
      list = list.filter((e) => e.category === activeCategory);
    }
    return list;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      els.toast.hidden = true;
    }, 3200);
  }

  function formatDate(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }

  // ---------------- Status bar ----------------

  function renderStatus() {
    if (statusMessage) {
      els.statusBar.hidden = false;
      els.statusBar.textContent = statusMessage;
      els.statusBar.classList.toggle("is-error", loadError);
    } else {
      els.statusBar.hidden = true;
    }
  }

  // ---------------- Alpha rail ----------------

  function renderAlphaRail() {
    const letters = [...new Set(entries.map((e) => firstChar(e.title)))].sort((a, b) =>
      collator.compare(a, b)
    );

    els.alphaRail.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = "alpha-tab" + (activeLetter === null ? " is-active" : "");
    allBtn.textContent = "全";
    allBtn.type = "button";
    allBtn.addEventListener("click", () => {
      activeLetter = null;
      view = { name: "home" };
      render();
    });
    els.alphaRail.appendChild(allBtn);

    letters.forEach((letter) => {
      const btn = document.createElement("button");
      btn.className = "alpha-tab" + (activeLetter === letter ? " is-active" : "");
      btn.textContent = letter;
      btn.type = "button";
      btn.addEventListener("click", () => {
        activeLetter = activeLetter === letter ? null : letter;
        view = { name: "home" };
        render();
      });
      els.alphaRail.appendChild(btn);
    });
  }

  // ---------------- Views ----------------

  function renderLoading() {
    els.main.innerHTML = `<div class="empty-state"><h3>読み込み中…</h3><p>辞典のデータを取得しています。</p></div>`;
  }

  function renderLoadError() {
    els.main.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<h3>読み込めませんでした</h3><p>通信状況を確認して、もう一度お試しください。</p>`;
    const btn = document.createElement("button");
    btn.className = "btn-add";
    btn.type = "button";
    btn.textContent = "再読み込み";
    btn.addEventListener("click", loadEntries);
    empty.appendChild(btn);
    els.main.appendChild(empty);
  }

  function renderCategoryChips() {
    const wrap = document.createElement("div");
    wrap.className = "category-chips";

    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = "category-chip" + (activeCategory === null ? " is-active" : "");
    allChip.textContent = "すべて";
    allChip.addEventListener("click", () => {
      activeCategory = null;
      render();
    });
    wrap.appendChild(allChip);

    CATEGORIES.forEach((cat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className =
        "category-chip " + categoryClass(cat) + (activeCategory === cat ? " is-active" : "");
      chip.textContent = cat;
      chip.addEventListener("click", () => {
        activeCategory = activeCategory === cat ? null : cat;
        render();
      });
      wrap.appendChild(chip);
    });

    return wrap;
  }

  function renderHome() {
    const list = filteredEntries();

    if (entries.length === 0) {
      els.main.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <h3>まだ項目がありません</h3>
        <p>「+ 追加」から、最初の項目を書いてみましょう。</p>
      `;
      const btn = document.createElement("button");
      btn.className = "btn-add";
      btn.type = "button";
      btn.innerHTML = '<span class="plus">+</span> 追加';
      btn.addEventListener("click", () => openForm("add"));
      empty.appendChild(btn);
      els.main.appendChild(empty);
      return;
    }

    els.main.innerHTML = "";
    els.main.appendChild(renderCategoryChips());

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = `
        <h3>見つかりませんでした</h3>
        <p>検索条件・索引タブ・分類の組み合わせを変えてお試しください。</p>
      `;
      els.main.appendChild(empty);
      return;
    }

    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = searchTerm
      ? `「${searchTerm}」の検索結果（${list.length}件）`
      : activeLetter
      ? `索引：${activeLetter}（${list.length}件）`
      : activeCategory
      ? `分類：${activeCategory}（${list.length}件）`
      : `すべての項目（${list.length}件）`;

    const grid = document.createElement("div");
    grid.className = "entry-grid";

    list.forEach((entry) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "entry-card";
      card.innerHTML = `
        ${
          entry.category
            ? `<span class="category-tag ${categoryClass(entry.category)}">${escapeHtml(
                entry.category
              )}</span>`
            : ""
        }
        <h3>${escapeHtml(entry.title)}</h3>
        <p>${escapeHtml(plainPreview(entry.body))}</p>
      `;
      card.addEventListener("click", () => {
        view = { name: "article", id: entry.id };
        render();
      });
      grid.appendChild(card);
    });

    els.main.appendChild(label);
    els.main.appendChild(grid);
  }

  function renderArticle(id) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      view = { name: "home" };
      render();
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "article-view";

    const back = document.createElement("button");
    back.className = "back-link";
    back.type = "button";
    back.textContent = "← 一覧にもどる";
    back.addEventListener("click", () => {
      view = { name: "home" };
      render();
    });

    const head = document.createElement("div");
    head.className = "article-head";
    head.innerHTML = `
      <div>
        <h2>${escapeHtml(entry.title)}</h2>
        <div class="article-meta">
          ${
            entry.category
              ? `<span class="category-tag ${categoryClass(entry.category)}">${escapeHtml(
                  entry.category
                )}</span>`
              : ""
          }
          <span>更新日: ${formatDate(entry.updatedAt)}</span>
        </div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "article-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-ghost";
    editBtn.type = "button";
    editBtn.textContent = "編集する";
    editBtn.addEventListener("click", () => openForm("edit", entry.id));

    const delBtn = document.createElement("button");
    delBtn.className = "btn-danger";
    delBtn.type = "button";
    delBtn.textContent = "削除する";
    delBtn.addEventListener("click", () => askDelete(entry.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    head.appendChild(actions);

    const body = document.createElement("div");
    body.className = "article-body";
    body.innerHTML = renderBodyRich(entry.body);

    wrap.appendChild(back);
    wrap.appendChild(head);
    wrap.appendChild(body);

    els.main.innerHTML = "";
    els.main.appendChild(wrap);
  }

  function renderForm(mode, id) {
    const editing = mode === "edit";
    const entry = editing ? entries.find((e) => e.id === id) : null;
    if (editing && !entry) {
      view = { name: "home" };
      render();
      return;
    }

    const form = document.createElement("form");
    form.className = "entry-form";
    form.noValidate = true;
    form.innerHTML = `
      <h2>${editing ? "項目を編集" : "新しい項目を追加"}</h2>

      <div class="form-field" id="titleField">
        <label for="titleInput">項目名</label>
        <input type="text" id="titleInput" maxlength="60" value="${
          editing ? escapeHtml(entry.title) : ""
        }" placeholder="例：flexbox">
        <span class="field-error">項目名を入力してください。</span>
      </div>

      <div class="form-field" id="categoryField">
        <label for="categoryInput">分類</label>
        <select id="categoryInput">
          <option value="" disabled${editing && entry.category ? "" : " selected"}>選択してください</option>
          ${CATEGORIES.map(
            (cat) =>
              `<option value="${cat}"${editing && entry.category === cat ? " selected" : ""}>${cat}</option>`
          ).join("")}
        </select>
        <span class="field-error">分類を選んでください。</span>
      </div>

      <div class="form-field" id="bodyField">
        <label for="bodyInput">本文</label>
        <textarea id="bodyInput" maxlength="20000" placeholder="この用語について説明を書きます。">${
          editing ? escapeHtml(entry.body) : ""
        }</textarea>
        <span class="field-error">本文を入力してください。</span>
        <span class="form-hint">
          **太字** ／ &#96;インラインコード&#96; ／ # 大きな文字 ／ - 箇条書き ／
          &#96;&#96;&#96;css のように書くとタイトル付きコードブロック ／ | 列1 | 列2 | の形式で表 が使えます。
        </span>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn-primary">${editing ? "変更を保存" : "この項目を保存"}</button>
        <button type="button" class="btn-ghost" id="cancelFormBtn">やめる</button>
      </div>
    `;

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const titleInput = form.querySelector("#titleInput");
      const bodyInput = form.querySelector("#bodyInput");
      const categoryInput = form.querySelector("#categoryInput");
      const submitBtn = form.querySelector('button[type="submit"]');

      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();
      const category = categoryInput.value;

      form.querySelector("#titleField").classList.toggle("has-error", !title);
      form.querySelector("#bodyField").classList.toggle("has-error", !body);
      form.querySelector("#categoryField").classList.toggle("has-error", !category);
      if (!title || !body || !category) return;

      // 追加のときもidをここで決めておくと、保存後にその記事ページへ移動できる
      const targetId = editing ? entry.id : makeId();

      submitBtn.disabled = true;
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = "保存中…";

      const result = await saveEntry({ id: targetId, title, category, body });

      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;

      if (result.ok) {
        showToast(editing ? "項目を更新しました" : "新しい項目を追加しました");
        view = { name: "article", id: targetId };
        render();
      }
      // 失敗時は writeToApi 内でトーストを表示済み。フォームはそのまま残す。
    });

    form.querySelector("#cancelFormBtn").addEventListener("click", () => {
      view = editing ? { name: "article", id: entry.id } : { name: "home" };
      render();
    });

    els.main.innerHTML = "";
    els.main.appendChild(form);
    form.querySelector("#titleInput").focus();
  }

  function openForm(mode, id) {
    view = { name: "form", mode, id };
    render();
  }

  // ---------------- Delete confirmation ----------------

  function askDelete(id) {
    pendingDeleteId = id;
    els.overlay.hidden = false;
    const entry = entries.find((e) => e.id === id);
    els.confirmMessage.textContent = entry
      ? `「${entry.title}」を削除しますか？この操作は取り消せません。`
      : "この項目を削除しますか？";
    els.confirmOk.focus();
  }

  function closeConfirm() {
    pendingDeleteId = null;
    els.overlay.hidden = true;
  }

  els.confirmCancel.addEventListener("click", closeConfirm);
  els.confirmOk.addEventListener("click", async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;

    els.confirmOk.disabled = true;
    els.confirmOk.textContent = "削除中…";

    const result = await removeEntry(id);

    els.confirmOk.disabled = false;
    els.confirmOk.textContent = "削除する";
    closeConfirm();

    if (result.ok) {
      view = { name: "home" };
      showToast("項目を削除しました");
      render();
    }
  });
  els.overlay.addEventListener("click", (ev) => {
    if (ev.target === els.overlay) closeConfirm();
  });

  // ---------------- Export (ローカルへのバックアップ) ----------------

  els.exportBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dictionary-entries.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("JSONファイルを書き出しました");
  });

  els.refreshBtn.addEventListener("click", loadEntries);

  // ---------------- Search / Add wiring ----------------

  els.searchInput.addEventListener("input", (ev) => {
    searchTerm = ev.target.value;
    if (view.name !== "home") view = { name: "home" };
    render();
  });

  els.addBtn.addEventListener("click", () => openForm("add"));

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (!els.overlay.hidden) closeConfirm();
  });

  // ---------------- Master render ----------------

  function render() {
    renderStatus();
    renderAlphaRail();
    els.entryTotal.textContent = loading || loadError ? "" : `全 ${entries.length} 項目`;

    if (loading) {
      renderLoading();
      return;
    }
    if (loadError) {
      renderLoadError();
      return;
    }

    if (view.name === "article") {
      renderArticle(view.id);
    } else if (view.name === "form") {
      renderForm(view.mode, view.id);
    } else {
      renderHome();
    }
  }

  // ---------------- Init ----------------

  loadEntries();
})();
