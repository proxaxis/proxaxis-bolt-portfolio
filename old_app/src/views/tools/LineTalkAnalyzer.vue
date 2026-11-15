<script setup>
import { ref } from 'vue';
import AppSnackbar from '@/components/AppSnackbar.vue';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const SESSION_GAP_MS = 60 * 60 * 1000;
const NAME_DOMINANCE_RATIO = 0.95;
const NESTED_NAME_MIN_RATIO = 0.4;
const MIN_NAME_OCCURRENCES = 2;

const DATE_LINE_RE = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[ 　(（](.+?)[)）]?)?$/;
const TIME_LINE_RE = /^(\d{1,2}):(\d{2})[\t 　]+(.+)$/;
const UNSEND_RE = /^(.*)がメッセージの送信を取り消しました$/;
const UNSEND_SELF_TEXT = 'メッセージの送信を取り消しました';
const CALL_DURATION_RE = /^\d{1,3}:\d{2}$/;
const BRACKET_RE = /^\[([^\]]+)\]$/;

const CALL_WORDS = ['不在着信', '応答なし', 'キャンセル', '通話', '通話に出ませんでした'];
const OTHER_WORDS = ['ファイル', '音声メッセージ', 'ボイスメッセージ', '連絡先', '位置情報', 'アルバム', 'ノート', 'プレゼントを贈りました。'];

const vmFileName = ref('');
const vmPastedText = ref('');
const vmIsDragging = ref(false);
const vmSourceLabel = ref('');
const analysis = ref(null);
const rfSnackbar = ref(null);

function classifyMessage(text) {
  const norm = text.trim().replace(BRACKET_RE, '$1').trim();
  if (norm === 'スタンプ') return 'stamp';
  if (norm === '画像' || norm === '写真') return 'image';
  if (norm === '動画') return 'video';
  if (CALL_DURATION_RE.test(norm) || CALL_WORDS.includes(norm)) return 'call';
  if (OTHER_WORDS.includes(norm)) return 'other';
  return 'text';
}

// スペース区切り形式では発言者名の区切りが曖昧なため、
// 「各行の先頭からの単語プレフィックス」のうち頻出かつ
// それ以上伸ばせないものを参加者名とみなす
function detectSpaceSeparatedNames(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const words = entry.rest.split(/\s+/).filter(Boolean);
    for (let k = 1; k < words.length; k++) {
      const candidate = words.slice(0, k).join(' ');
      counts.set(candidate, (counts.get(candidate) || 0) + 1);
    }
  }

  const maxChildCount = new Map();
  for (const [candidate, count] of counts) {
    const boundary = candidate.lastIndexOf(' ');
    if (boundary === -1) continue;
    const parent = candidate.slice(0, boundary);
    if (counts.has(parent)) {
      maxChildCount.set(parent, Math.max(maxChildCount.get(parent) || 0, count));
    }
  }

  const stable = [];
  for (const [candidate, count] of counts) {
    if (count < MIN_NAME_OCCURRENCES) continue;
    const dominantChild = maxChildCount.get(candidate) || 0;
    if (dominantChild < count * NAME_DOMINANCE_RATIO) {
      stable.push(candidate);
    }
  }

  // 「参加者名 + 発言先頭の定型句」を誤検出しないよう、
  // 既知名を拡張した候補で出現数が既知名に対して少なすぎるものを除外する
  const stableSet = new Set(stable);
  const names = stable.filter((candidate) => {
    const count = counts.get(candidate);
    const words = candidate.split(' ');
    for (let k = 1; k < words.length; k++) {
      const ancestor = words.slice(0, k).join(' ');
      if (stableSet.has(ancestor) && count < counts.get(ancestor) * NESTED_NAME_MIN_RATIO) {
        return false;
      }
    }
    return true;
  });

  return names.sort((a, b) => b.length - a.length);
}

function createParticipantStats(name) {
  return {
    name,
    messages: 0,
    text: 0,
    textChars: 0,
    stamp: 0,
    image: 0,
    video: 0,
    call: 0,
    other: 0,
    unsend: 0,
    weekday: new Array(7).fill(0),
    hour: new Array(24).fill(0),
    sessionsStarted: 0,
    replies: 0,
    replyTimeSum: 0,
    replyTimeCount: 0,
    replyTo: new Map(),
  };
}

function analyzeTalk(rawText) {
  const entries = [];
  let currentDate = null;

  for (const line of rawText.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const dateMatch = line.match(DATE_LINE_RE);
    if (dateMatch) {
      currentDate = {
        year: +dateMatch[1],
        month: +dateMatch[2],
        day: +dateMatch[3],
      };
      continue;
    }

    const timeMatch = line.match(TIME_LINE_RE);
    if (timeMatch && currentDate && +timeMatch[1] <= 23 && +timeMatch[2] <= 59) {
      const { year, month, day } = currentDate;
      entries.push({
        ts: new Date(year, month - 1, day, +timeMatch[1], +timeMatch[2]).getTime(),
        weekday: new Date(year, month - 1, day).getDay(),
        hour: +timeMatch[1],
        dateKey: `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`,
        rest: timeMatch[3],
      });
      continue;
    }

    if (entries.length && line.length) {
      entries[entries.length - 1].rest += '\n' + line;
    }
  }

  const unsendEvents = [];
  const spaceEntries = [];
  const parsed = [];
  let unknownCount = 0;

  for (const entry of entries) {
    const rest = entry.rest;
    if (rest.trim() === UNSEND_SELF_TEXT) {
      unsendEvents.push({ sender: null });
      continue;
    }
    const unsendMatch = rest.match(UNSEND_RE);
    if (unsendMatch) {
      unsendEvents.push({ sender: unsendMatch[1].trim() });
      continue;
    }
    if (rest.includes('\t')) {
      const parts = rest.split('\t');
      const sender = parts[0].trim();
      const text = parts.slice(1).join(' ').trim();
      if (sender && text) {
        parsed.push({ ...entry, sender, text });
      } else {
        unknownCount++;
      }
      continue;
    }
    spaceEntries.push(entry);
  }

  const names = detectSpaceSeparatedNames(spaceEntries);
  for (const entry of spaceEntries) {
    const rest = entry.rest;
    const sender = names.find((n) => rest !== n && rest.startsWith(n) && /[\s　]/.test(rest[n.length] || ''));
    if (!sender) {
      unknownCount++;
      continue;
    }
    const text = rest.slice(sender.length).trim();
    if (!text) {
      unknownCount++;
      continue;
    }
    parsed.push({ ...entry, sender, text });
  }

  const participants = new Map();
  const getParticipant = (name) => {
    if (!participants.has(name)) {
      participants.set(name, createParticipantStats(name));
    }
    return participants.get(name);
  };

  const pairs = new Map();
  const activeDays = new Set();
  const weekday = new Array(7).fill(0);
  const hour = new Array(24).fill(0);
  let sessions = 0;
  let previous = null;

  for (const message of parsed) {
    const stats = getParticipant(message.sender);
    const type = classifyMessage(message.text);
    stats.messages++;
    stats[type]++;
    if (type === 'text') {
      stats.textChars += [...message.text].length;
    }
    stats.weekday[message.weekday]++;
    stats.hour[message.hour]++;
    weekday[message.weekday]++;
    hour[message.hour]++;
    activeDays.add(message.dateKey);

    if (!previous || message.ts - previous.ts > SESSION_GAP_MS) {
      sessions++;
      stats.sessionsStarted++;
    } else if (previous.sender !== message.sender) {
      stats.replies++;
      stats.replyTimeSum += message.ts - previous.ts;
      stats.replyTimeCount++;
      stats.replyTo.set(previous.sender, (stats.replyTo.get(previous.sender) || 0) + 1);
      const key = `${previous.sender}\u0000${message.sender}`;
      if (!pairs.has(key)) {
        pairs.set(key, { from: previous.sender, to: message.sender, count: 0, sumMs: 0 });
      }
      const pair = pairs.get(key);
      pair.count++;
      pair.sumMs += message.ts - previous.ts;
    }
    previous = message;
  }

  let totalUnsent = 0;
  for (const event of unsendEvents) {
    totalUnsent++;
    if (event.sender && participants.has(event.sender)) {
      participants.get(event.sender).unsend++;
    }
  }

  const totalMessages = parsed.length;
  const topIndex = (arr) => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);
  const participantList = [...participants.values()]
    .sort((a, b) => b.messages - a.messages)
    .map((p) => ({
      ...p,
      share: totalMessages ? p.messages / totalMessages : 0,
      textRate: p.messages ? p.text / p.messages : 0,
      avgChars: p.text ? p.textChars / p.text : 0,
      avgPerDay: activeDays.size ? p.messages / activeDays.size : 0,
      topWeekday: topIndex(p.weekday),
      topHour: topIndex(p.hour),
      avgReplyMs: p.replyTimeCount ? p.replyTimeSum / p.replyTimeCount : null,
      replyToTop: [...p.replyTo.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }));

  const pairList = [...pairs.values()].map((pair) => ({ ...pair, avgMs: pair.count ? pair.sumMs / pair.count : 0 })).sort((a, b) => b.count - a.count);

  const pairLookup = new Map();
  for (const pair of pairList) {
    pairLookup.set(`${pair.from}\u0000${pair.to}`, pair);
  }

  return {
    totalMessages,
    totalUnsent,
    unknownCount,
    sessions,
    activeDays: activeDays.size,
    periodStart: parsed.length ? parsed[0].dateKey : null,
    periodEnd: parsed.length ? parsed[parsed.length - 1].dateKey : null,
    weekday,
    hour,
    participants: participantList,
    pairs: pairList,
    pairLookup,
  };
}

function runAnalysis(text, label) {
  const result = analyzeTalk(text);
  if (!result.totalMessages) {
    rfSnackbar.value?.alert('失敗: 解析できるメッセージが見つかりませんでした');
    return;
  }
  analysis.value = result;
  vmSourceLabel.value = label;
  rfSnackbar.value?.message(`${result.totalMessages.toLocaleString('ja-JP')} 件の発言を解析しました`);
}

async function readFile(file) {
  try {
    const text = await file.text();
    vmFileName.value = file.name;
    runAnalysis(text, file.name);
  } catch (error) {
    console.error('Failed to read file:', error);
    rfSnackbar.value?.alert('失敗: ファイルの読み込みに失敗しました');
  }
}

function onFileChange(event) {
  const file = event.target.files?.[0];
  if (file) {
    readFile(file);
  }
  event.target.value = '';
}

function onDrop(event) {
  vmIsDragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    readFile(file);
  }
}

async function loadSample() {
  try {
    const response = await fetch(sampleTalkUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    vmFileName.value = 'sample-talk-hist.txt';
    runAnalysis(text, 'サンプルデータ');
  } catch (error) {
    console.error('Failed to load sample:', error);
    rfSnackbar.value?.alert('失敗: サンプルデータの読み込みに失敗しました');
  }
}

function analyzePasted() {
  const text = vmPastedText.value.trim();
  if (!text) {
    rfSnackbar.value?.alert('失敗: テキストを貼り付けてください');
    return;
  }
  vmFileName.value = '';
  runAnalysis(text, '貼り付けテキスト');
}

function clearAnalysis() {
  analysis.value = null;
  vmFileName.value = '';
  vmSourceLabel.value = '';
}

function fmtInt(value) {
  return value.toLocaleString('ja-JP');
}

function fmtRate(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtDuration(ms) {
  if (ms == null) return '-';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '1分未満';
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}

function barHeight(value, max) {
  return { height: max > 0 ? `${(value / max) * 100}%` : '0%' };
}

function pairCount(from, to) {
  return analysis.value?.pairLookup.get(`${from}\u0000${to}`)?.count || 0;
}
</script>

<template>
  <div class="line-talk-analyzer">
    <h1 class="page-title">LINEトーク履歴 アナライザー</h1>

    <!-- ファイルアップロード -->
    <section class="card upload-card" :class="{ 'is-dragging': vmIsDragging }" @dragover.prevent="vmIsDragging = true" @dragleave.prevent="vmIsDragging = false" @drop.prevent="onDrop">
      <h2>トーク履歴ファイル</h2>
      <p class="description">LINEの「トーク履歴を送信」で保存した .txt ファイルを選択してください。ファイルはブラウザ内でのみ処理され、外部には送信されません。</p>
      <div class="upload-actions">
        <label class="ui-button ui-button--primary file-label">
          ファイルを選択
          <input type="file" accept=".txt,text/plain" @change="onFileChange" hidden />
        </label>
      </div>
      <p class="drop-hint">ここにファイルをドラッグ＆ドロップすることもできます</p>
      <p v-if="vmFileName" class="file-name">読み込み済み: {{ vmFileName }}</p>

      <details class="paste-area">
        <summary>テキストを直接貼り付ける</summary>
        <textarea v-model="vmPastedText" class="ui-control" rows="6" placeholder="トーク履歴のテキストを貼り付け"></textarea>
        <button type="button" class="ui-button ui-button--outline" @click="analyzePasted">貼り付け内容を解析</button>
      </details>
    </section>

    <template v-if="analysis">
      <!-- 概要 -->
      <section class="card">
        <div class="card-header">
          <h2>
            概要 <span class="source-label">({{ vmSourceLabel }})</span>
          </h2>
          <button type="button" class="ui-button ui-button--outline" @click="clearAnalysis">結果をクリア</button>
        </div>
        <div class="stat-grid">
          <div class="stat-item">
            <span class="stat-label">期間</span>
            <span class="stat-value">{{ analysis.periodStart }} 〜 {{ analysis.periodEnd }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">会話のあった日数</span>
            <span class="stat-value">{{ fmtInt(analysis.activeDays) }} 日</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">総発言数</span>
            <span class="stat-value">{{ fmtInt(analysis.totalMessages) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">参加者数</span>
            <span class="stat-value">{{ fmtInt(analysis.participants.length) }} 人</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">会話セッション数</span>
            <span class="stat-value">{{ fmtInt(analysis.sessions) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">送信取り消し</span>
            <span class="stat-value">{{ fmtInt(analysis.totalUnsent) }}</span>
          </div>
        </div>
        <p v-if="analysis.unknownCount" class="note">※ {{ fmtInt(analysis.unknownCount) }} 行は発言者を特定できず集計対象外です</p>
      </section>

      <!-- 全体の傾向 -->
      <section class="card">
        <h2>全体の傾向</h2>
        <div class="chart-pair">
          <div class="chart-block">
            <h3>曜日別</h3>
            <div class="bar-chart">
              <div v-for="(value, index) in analysis.weekday" :key="index" class="bar-col" :title="`${WEEKDAY_LABELS[index]}曜日: ${value}件`">
                <div class="bar" :style="barHeight(value, Math.max(...analysis.weekday))"></div>
                <span class="bar-label">{{ WEEKDAY_LABELS[index] }}</span>
              </div>
            </div>
          </div>
          <div class="chart-block">
            <h3>時間帯別（1時間刻み）</h3>
            <div class="bar-chart bar-chart--hours">
              <div v-for="(value, index) in analysis.hour" :key="index" class="bar-col" :title="`${index}時台: ${value}件`">
                <div class="bar" :style="barHeight(value, Math.max(...analysis.hour))"></div>
                <span class="bar-label">{{ index % 3 === 0 ? index : '' }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 話す・答える -->
      <section v-if="analysis.pairs.length" class="card">
        <h2>誰が話して誰が答えるか</h2>
        <p class="description">60分以内に続く異なる発言者への発言を「返信」として集計しています。また、60分以上の間隔を空けた最初の発言を「会話の開始」として集計しています。</p>
        <div class="matrix-wrapper">
          <table class="matrix">
            <thead>
              <tr>
                <th>話した人 ＼ 答えた人</th>
                <th v-for="p in analysis.participants" :key="p.name">{{ p.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="from in analysis.participants" :key="from.name">
                <th>{{ from.name }}</th>
                <td v-for="to in analysis.participants" :key="to.name">
                  {{ from.name === to.name ? '—' : pairCount(from.name, to.name) || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul class="pair-list">
          <li v-for="pair in analysis.pairs" :key="`${pair.from}-${pair.to}`">
            <span class="pair-route">{{ pair.from }} → {{ pair.to }}</span>
            <span class="pair-count">{{ fmtInt(pair.count) }} 回</span>
            <span class="pair-time">平均応答 {{ fmtDuration(pair.avgMs) }}</span>
          </li>
        </ul>
      </section>

      <!-- 参加者ごとの分析 -->
      <section>
        <h2 class="section-title">参加者ごとの分析</h2>
        <div class="participant-grid">
          <article v-for="p in analysis.participants" :key="p.name" class="card participant-card">
            <h3 class="participant-name">
              {{ p.name }}
              <span class="share">全体の {{ fmtRate(p.share) }}</span>
            </h3>
            <div class="stat-grid">
              <div class="stat-item">
                <span class="stat-label">発言数</span>
                <span class="stat-value">{{ fmtInt(p.messages) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">テキスト発言数</span>
                <span class="stat-value">{{ fmtInt(p.text) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">テキスト率</span>
                <span class="stat-value">{{ fmtRate(p.textRate) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">1テキストあたり文字数</span>
                <span class="stat-value">{{ p.avgChars.toFixed(1) }} 字</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">1日あたり発言数</span>
                <span class="stat-value">{{ p.avgPerDay.toFixed(1) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">スタンプ</span>
                <span class="stat-value">{{ fmtInt(p.stamp) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">画像</span>
                <span class="stat-value">{{ fmtInt(p.image) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">動画</span>
                <span class="stat-value">{{ fmtInt(p.video) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">通話関連</span>
                <span class="stat-value">{{ fmtInt(p.call) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">その他</span>
                <span class="stat-value">{{ fmtInt(p.other) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">送信取り消し</span>
                <span class="stat-value">{{ fmtInt(p.unsend) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">発言の多い曜日</span>
                <span class="stat-value">{{ WEEKDAY_LABELS[p.topWeekday] }}曜日</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">発言の多い時間帯</span>
                <span class="stat-value">{{ p.topHour }}時台</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">会話を始めた回数</span>
                <span class="stat-value">{{ fmtInt(p.sessionsStarted) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">返信した回数</span>
                <span class="stat-value">{{ fmtInt(p.replies) }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">平均返信時間</span>
                <span class="stat-value">{{ fmtDuration(p.avgReplyMs) }}</span>
              </div>
            </div>

            <div class="chart-pair">
              <div class="chart-block">
                <h4>曜日別</h4>
                <div class="bar-chart">
                  <div v-for="(value, index) in p.weekday" :key="index" class="bar-col" :title="`${WEEKDAY_LABELS[index]}曜日: ${value}件`">
                    <div class="bar" :style="barHeight(value, Math.max(...p.weekday))"></div>
                    <span class="bar-label">{{ WEEKDAY_LABELS[index] }}</span>
                  </div>
                </div>
              </div>
              <div class="chart-block">
                <h4>時間帯別</h4>
                <div class="bar-chart bar-chart--hours">
                  <div v-for="(value, index) in p.hour" :key="index" class="bar-col" :title="`${index}時台: ${value}件`">
                    <div class="bar" :style="barHeight(value, Math.max(...p.hour))"></div>
                    <span class="bar-label">{{ index % 3 === 0 ? index : '' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="p.replyToTop.length" class="reply-to">
              <h4>よく返信する相手</h4>
              <ul>
                <li v-for="target in p.replyToTop" :key="target.name">{{ target.name }}: {{ fmtInt(target.count) }} 回</li>
              </ul>
            </div>
          </article>
        </div>
      </section>
    </template>

    <AppSnackbar ref="rfSnackbar" />
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/variables' as var;

.line-talk-analyzer {
  margin: 0 auto;

  .page-title {
    text-align: center;
  }
}

.card {
  background: var(--bg-1);
  padding: 1.5rem;
  border-radius: var(--border-radius);
  box-shadow: 0 2px 6px var(--shadow);
  margin-bottom: 2rem;

  h2 {
    font-size: 1.1rem;
    margin: 0 0 1rem;
    border-bottom: 2px solid var(--border);
    padding-bottom: 0.5rem;
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0.5rem;

  h2 {
    margin: 0;
    border-bottom: none;
    padding-bottom: 0;
  }

  .source-label {
    font-size: 0.85rem;
    font-weight: normal;
    color: var(--text-1);
  }
}

.description {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--text-1);
}

.note {
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: var(--text-1);
}

.upload-card {
  border: 2px dashed transparent;

  &.is-dragging {
    border-color: var(--primary);
  }
}

.upload-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.file-label {
  input {
    display: none;
  }
}

.drop-hint {
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
  color: var(--text-1);
}

.file-name {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
  font-weight: bold;
}

.paste-area {
  margin-top: 1rem;

  summary {
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-1);
  }

  textarea {
    margin-top: 0.75rem;
    width: 100%;
    resize: vertical;
    font-family: inherit;
    box-sizing: border-box;
  }

  .ui-button {
    margin-top: 0.5rem;
  }
}

.ui-control {
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  font-size: 1rem;
  background: var(--bg-0);
  color: var(--text-0);
}

.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
  color: var(--text-0);
  cursor: pointer;
  transition: all 0.2s;
  font-weight: bold;

  &:hover {
    opacity: 0.95;
  }
}

.ui-button--outline {
  border-color: var(--primary);
  color: var(--primary);

  &:hover {
    background-color: var(--primary);
    color: var(--text-0);
  }
}

.ui-button--primary {
  background-color: var(--primary);
  border-color: transparent;
  color: #fff;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-1);
  }

  .stat-value {
    font-size: 1.05rem;
    font-weight: bold;
    overflow-wrap: anywhere;
  }
}

.chart-pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1rem;
}

.chart-block {
  h3,
  h4 {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
  }
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 80px;

  .bar-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    min-width: 0;
  }

  .bar {
    width: 100%;
    min-height: 2px;
    background: var(--primary);
    border-radius: 2px 2px 0 0;
  }

  .bar-label {
    margin-top: 0.25rem;
    font-size: 0.7rem;
    color: var(--text-1);
    white-space: nowrap;
  }
}

.matrix-wrapper {
  overflow-x: auto;
}

.matrix {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.9rem;

  th,
  td {
    border: 1px solid var(--border);
    padding: 0.5rem 0.75rem;
    text-align: center;
  }

  thead th {
    background: var(--bg-2);
  }

  tbody th {
    background: var(--bg-2);
    text-align: left;
  }
}

.pair-list {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: baseline;
    padding: 0.5rem 0.75rem;
    background: var(--bg-0);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
  }

  .pair-route {
    font-weight: bold;
  }

  .pair-time {
    font-size: 0.85rem;
    color: var(--text-1);
  }
}

.section-title {
  font-size: 1.2rem;
  margin: 0 0 1rem;
}

.participant-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.participant-card {
  margin-bottom: 0;

  .participant-name {
    margin: 0 0 1rem;
    font-size: 1.05rem;
    border-bottom: 2px solid var(--border);
    padding-bottom: 0.5rem;
    overflow-wrap: anywhere;

    .share {
      font-size: 0.8rem;
      font-weight: normal;
      color: var(--text-1);
      margin-left: 0.5rem;
    }
  }
}

.reply-to {
  margin-top: 1rem;

  h4 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
}
</style>
