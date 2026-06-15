// CommandInput.tsx — Natural language command panel
import { useState, useRef, type CSSProperties } from 'react';
import { getBaseUrl } from '../api';

export interface CommandInputProps {
  onSend: (cmd: string) => void;
  disabled?: boolean;
}

const codeStyle: CSSProperties = { color: 'var(--color-cyan)' };

const accordionBodyStyle: CSSProperties = {
  padding: '8px 14px 12px',
  display: 'flex', flexDirection: 'column', gap: 6,
  borderBottom: '1px solid var(--color-border-default)',
};

const accordionSubHeaderStyle: CSSProperties = {
  marginTop: 4,
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 10,
  color: 'var(--color-text-tertiary)',
  letterSpacing: '0.05em', textTransform: 'uppercase',
};

const accordionListStyle: CSSProperties = {
  margin: 0, paddingLeft: 16,
  display: 'flex', flexDirection: 'column', gap: 3,
};

const accordionListStyleTertiary: CSSProperties = {
  ...accordionListStyle, color: 'var(--color-text-tertiary)',
};

function AccordionHeader({
  label, hint, open, onClick, last = false,
}: { label: string; hint: string; open: boolean; onClick: () => void; last?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', textAlign: 'left',
        padding: '8px 12px',
        background: open ? 'var(--color-bg-surface-1)' : 'transparent',
        border: 'none',
        borderBottom: open || last ? 'none' : '1px solid var(--color-border-default)',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)', fontSize: 11,
        color: 'var(--color-text-primary)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-block', width: 8,
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform var(--transition-fast)',
          color: 'var(--color-text-tertiary)',
        }}>▶</span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
          — {hint}
        </span>
      </span>
    </button>
  );
}

type HelpSection = 'pick' | 'pyramid' | 'unstack' | 'scan' | 'outlier' | 'config' | 'misc';

export default function CommandInput({ onSend, disabled = false }: CommandInputProps) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [showHelp, setShowHelp] = useState(false);
  const [openSection, setOpenSection] = useState<HelpSection | null>('pick');
  const inputRef = useRef<HTMLInputElement>(null);
  const docsUrl = `${getBaseUrl()}/api/robot/docs`;

  function toggleSection(s: HelpSection) {
    setOpenSection(cur => (cur === s ? null : s));
  }

  function submit(text?: string) {
    const cmd = (text ?? value).trim();
    if (!cmd) return;
    setHistory(h => [cmd, ...h.slice(0, 19)]);
    setHistIdx(-1);
    setValue('');
    onSend(cmd);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setValue(history[next] ?? '');
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(histIdx - 1, -1);
      setHistIdx(next);
      setValue(next === -1 ? '' : history[next]);
    }
  }

  return (
    <div className="ds-card" style={{ flexShrink: 0 }}>
      <div className="ds-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="var(--color-text-tertiary)" strokeWidth="2" strokeLinecap="round">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          <span className="ds-card-label">Command</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {disabled && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-disabled)' }}>
              task running…
            </span>
          )}
          <button
            className="ds-btn ghost sm"
            onClick={() => setShowHelp(h => !h)}
            aria-expanded={showHelp}
            title="Command 사용법 / API 문서"
            style={{ fontSize: 10, padding: '2px 8px' }}
          >
            {showHelp ? '× Close' : '? Help'}
          </button>
        </div>
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Help panel — accordion by skill */}
        {showHelp && (
          <div style={{
            background: 'var(--color-bg-surface-2)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5,
            color: 'var(--color-text-secondary)',
            display: 'flex', flexDirection: 'column',
            // Cap the panel so a long open section never pushes the input row
            // off-screen — scroll inside the panel instead.
            maxHeight: '40vh', overflowY: 'auto',
          }}>
            {/* ── Pick ─────────────────────────────────────────────── */}
            <AccordionHeader
              label="Pick"
              hint="컵 한 개 집기"
              open={openSection === 'pick'}
              onClick={() => toggleSection('pick')}
            />
            {openSection === 'pick' && (
              <div style={accordionBodyStyle}>
                <div style={{ color: 'var(--color-text-tertiary)' }}>
                  좌표계 <strong>base_link</strong>, 단위 <strong>m</strong>. X·Y 는 컵 중앙, Z 는 컵 <strong>윗면</strong> 기준.
                </div>
                <div style={accordionSubHeaderStyle}>사용법</div>
                <ul style={accordionListStyle}>
                  <li><code style={codeStyle}>/pick</code>{'  '}— 현재 EE xy 위치에서 <code>--cup 1</code> (Z 미지정 시 <code>nested=1</code> 기본)</li>
                  <li><code style={codeStyle}>/pick N</code>{'  '}— 현재 EE xy 위치에서 nested 컵 N 개</li>
                  <li><code style={codeStyle}>/pick -x X -y Y -z Z</code>{'  '}— Z 를 명시 (컵 윗면 중앙)</li>
                  <li><code style={codeStyle}>/pick -x X -y Y --cup N</code>{'  '}— nested 컵 N 개 → Z 는 <strong>ROS 2 가 자동 계산</strong></li>
                  <li><code style={codeStyle}>/pick -x X -y Y</code>{'  '}— <code>--cup 1</code> 과 동일</li>
                  <li><code style={codeStyle}>/pick X Y Z</code>{'  '}— positional, Z 명시</li>
                  <li><code style={codeStyle}>/pick X Y</code>{'  '}— positional, <code>--cup 1</code> 과 동일</li>
                </ul>
                <div style={accordionSubHeaderStyle}>예시</div>
                <ul style={accordionListStyleTertiary}>
                  <li><code style={codeStyle}>/pick</code> — 현재 EE xy, 1 컵</li>
                  <li><code style={codeStyle}>/pick 2</code> — 현재 EE xy, 2 컵 nested</li>
                  <li><code style={codeStyle}>/pick -x 0.45 -y -0.12 -z 0.05</code> — 명시 Z</li>
                  <li><code style={codeStyle}>/pick -x 0.45 -y -0.12 --cup 6</code> — 6 컵 스택 상단</li>
                </ul>
              </div>
            )}

            {/* ── Pyramid ─────────────────────────────────────────── */}
            <AccordionHeader
              label="Pyramid"
              hint="3-2-1 피라미드 단위 스킬"
              open={openSection === 'pyramid'}
              onClick={() => toggleSection('pyramid')}
            />
            {openSection === 'pyramid' && (
              <div style={accordionBodyStyle}>
                <div style={{ color: 'var(--color-text-tertiary)' }}>
                  컵 하나를 pick → 지정 slot 으로 place. cp/degree/pick_z 는 서버
                  저장값 (config 로 변경). 6번 호출 (<code>1l→1m→1r→2l→2r→3m</code>) 로 피라미드 완성.
                </div>
                <div style={accordionSubHeaderStyle}>사용법</div>
                <ul style={accordionListStyle}>
                  <li>
                    <code style={codeStyle}>/pyramid &lt;slot&gt;</code>
                    {'  '}— 현재 EE xy 위치에서 pick → slot 으로 place
                  </li>
                  <li>
                    <code style={codeStyle}>/pyramid &lt;slot&gt; X Y [nested]</code>
                    {'  '}— 명시 pick 좌표 (nested=source 잔여 컵 수, 기본 1)
                  </li>
                </ul>
                <div style={accordionSubHeaderStyle}>예시</div>
                <ul style={accordionListStyleTertiary}>
                  <li><code style={codeStyle}>/pyramid 1l</code> — 현재 EE 에서 → 1l 슬롯</li>
                  <li><code style={codeStyle}>/pyramid 2r</code> — 현재 EE 에서 → 2r 슬롯</li>
                  <li><code style={codeStyle}>/pyramid 3m 0.40 0.10</code> — (0.40, 0.10) 에서 → 3m</li>
                  <li><code style={codeStyle}>/pyramid 3m 0.40 0.10 6</code> — 6컵 nest 의 맨 위부터 → 3m</li>
                </ul>
                <div style={accordionSubHeaderStyle}>슬롯</div>
                <ul style={accordionListStyleTertiary}>
                  <li><code>1l 1m 1r</code> — bottom tier (3개)</li>
                  <li><code>2l 2r</code> — middle tier (2개)</li>
                  <li><code>3m</code> — top tier (1개)</li>
                </ul>
              </div>
            )}

            {/* ── Unstack ─────────────────────────────────────────── */}
            <AccordionHeader
              label="Unstack"
              hint="피라미드 역순 해체 → nested 스택"
              open={openSection === 'unstack'}
              onClick={() => toggleSection('unstack')}
            />
            {openSection === 'unstack' && (
              <div style={accordionBodyStyle}>
                <div style={{ color: 'var(--color-text-tertiary)' }}>
                  pyramid 의 역동작. slot 의 컵을 pick → 목적지 (x, y) 에 nested 컬럼으로
                  place. pick 좌표·pick_z 는 서버 저장값. 위에서부터 해체
                  (<code>3m→2r→2l→1r→1m→1l</code>) 하며 매 컵 <code>nested</code> 를
                  1→6 으로 올리면 한 스택으로 모인다.
                </div>
                <div style={accordionSubHeaderStyle}>사용법</div>
                <ul style={accordionListStyle}>
                  <li>
                    <code style={codeStyle}>/unstack &lt;slot&gt; X Y</code>
                    {'  '}— slot 컵을 (X, Y) 에 place (nested=1)
                  </li>
                  <li>
                    <code style={codeStyle}>/unstack &lt;slot&gt; X Y nested</code>
                    {'  '}— nested = 목적지 컬럼 높이 (1=맨 아래)
                  </li>
                  <li>
                    <code style={codeStyle}>/unstack --all [X Y]</code>
                    {'  '}— <strong>전체 6컵 해체 파이프라인</strong> (위 버튼). 3m→2r→2l→1r→1m→1l
                    순으로 모두 집어 (X, Y) 한 스택으로 (기본 <code>0.40 0.10</code>)
                  </li>
                </ul>
                <div style={accordionSubHeaderStyle}>예시</div>
                <ul style={accordionListStyleTertiary}>
                  <li><code style={codeStyle}>/unstack 3m 0.40 0.10</code> — top 컵 → (0.40,0.10) 바닥</li>
                  <li><code style={codeStyle}>/unstack 2r 0.40 0.10 2</code> — 두 번째 컵 nesting</li>
                  <li><code style={codeStyle}>/unstack --all</code> — 6컵 전체 해체 → (0.40, 0.10)</li>
                  <li><code style={codeStyle}>/unstack --all 0.45 -0.10</code> — 목적지 지정 전체 해체</li>
                </ul>
                <div style={accordionSubHeaderStyle}>참고</div>
                <ul style={accordionListStyleTertiary}>
                  <li><code>/unstack --all</code> = 서버 스킬 <code>/api/robot/skill/unstack_all</code> (script/unstack.sh 의 스킬화) · 단계별 재시도 내장 · ~수 분 소요</li>
                  <li>단계 실패 시 시퀀스 중단, <code>완료 N/6</code> + 단계별 결과를 로그에 보고</li>
                  <li><code>place_z = pick_z + (nested-1) × nest_inc</code></li>
                </ul>
              </div>
            )}

            {/* ── Scan ────────────────────────────────────────────── */}
            <AccordionHeader
              label="Scan"
              hint="2방향 라인 / 4방향 사각형"
              open={openSection === 'scan'}
              onClick={() => toggleSection('scan')}
            />
            {openSection === 'scan' && (
              <div style={accordionBodyStyle}>
                <div style={{ color: 'var(--color-text-tertiary)' }}>
                  두 가지 스캔 모드. 인자가 없는 단일 스킬이라 본문은 빈 객체.
                  각 웨이포인트 도달 후{' '}
                  <code style={codeStyle}>dwell_sec</code>(기본 5초) 만큼 대기.
                </div>
                <div style={accordionSubHeaderStyle}>사용법</div>
                <ul style={accordionListStyle}>
                  <li>
                    <code style={codeStyle}>/scan</code> /{' '}
                    <code style={codeStyle}>/scan line</code>
                    {'  '}— 2방향: PTP 로{' '}
                    <code>초기 위치 → pos1 → pos2 → 초기 위치</code>
                  </li>
                  <li>
                    <code style={codeStyle}>/scan square</code>
                    {'  '}— 4방향 사각형: 카메라 <strong>하향 고정</strong>,
                    base_link XY 사각형 네 꼭짓점을 <strong>HOME EE 높이</strong>에서
                    순회 (꼭짓점1→2→3→4→1) 후 시작 위치 복귀
                  </li>
                </ul>
                <div style={accordionSubHeaderStyle}>참고</div>
                <ul style={accordionListStyleTertiary}>
                  <li>pos1/pos2 joint 좌표는 ROS 2 <code>ScanConfig</code> 에서 정의</li>
                  <li>사각형 중심/크기는 <code>square_center_x/y</code>, <code>square_size</code> (ROS 2 <code>ScanConfig</code>)</li>
                  <li><code>/scan square</code> 는 변마다 LIN, 실패 시 PTP→OMPL 폴백</li>
                </ul>
              </div>
            )}

            {/* ── Outlier Cup (fallen + mouth-up recovery) ────────── */}
            <AccordionHeader
              label="Outlier Cup"
              hint="비정상 자세 컵 인식 · 복구"
              open={openSection === 'outlier'}
              onClick={() => toggleSection('outlier')}
            />
            {openSection === 'outlier' && (
              <div style={accordionBodyStyle}>
                <div style={{ color: 'var(--color-text-tertiary)' }}>
                  YOLO-seg 가 비정상 자세 컵을 인식(상시 서비스), 로봇이 잡아 복구. 넘어진 컵만
                  (<code style={codeStyle}>/fallen</code>) 또는 넘어진 컵 + 입구위 컵 한 번에
                  (<code style={codeStyle}>/outlier</code>, 오케스트레이터).
                </div>
                <div style={accordionSubHeaderStyle}>인식 / 복구</div>
                <ul style={accordionListStyle}>
                  <li><code style={codeStyle}>/fallen state</code> · <code style={codeStyle}>/fallen detect [start|stop]</code>{'  '}— 인식 상태 · YOLO on/off</li>
                  <li><code style={codeStyle}>/fallen recovery [drop|place] [--single] [--dry]</code>{'  '}— 넘어진 컵만</li>
                  <li><code style={codeStyle}>/outlier recovery [drop|place] [--dry] [--sim]</code>{'  '}— 넘어진 컵 → 입구위 컵 한 번에</li>
                </ul>
                <div style={accordionSubHeaderStyle}>참고</div>
                <ul style={accordionListStyleTertiary}>
                  <li><code>drop</code>=그 자리 · <code>place</code>=옮겨 세우기 · <code>--dry</code> approach만 · <code>--sim</code> HW 우회 · <code>/outlier</code> 는 multi-cup 항상 ON</li>
                  <li>1회 실행 — 중지는 <strong>Abort</strong> 버튼 · 실행 시 <code>skill_api</code> 자동 정지 후 다음 pick 에서 재시작</li>
                </ul>
              </div>
            )}

            {/* ── Config ──────────────────────────────────────────── */}
            <AccordionHeader
              label="Config"
              hint="피라미드 / 워크스페이스 설정"
              open={openSection === 'config'}
              onClick={() => toggleSection('config')}
            />
            {openSection === 'config' && (
              <div style={accordionBodyStyle}>
                <div style={accordionSubHeaderStyle}>피라미드</div>
                <ul style={accordionListStyle}>
                  <li><code style={codeStyle}>/config pyramid</code>{'  '}— 현재 cp / degree / pick_z + 6 slot 좌표</li>
                  <li><code style={codeStyle}>/config pyramid center X Y</code>{'  '}— 중심 좌표 갱신</li>
                  <li><code style={codeStyle}>/config pyramid degree D</code>{'  '}— 행 방향 yaw (deg, 0~360, +x 기준 반시계)</li>
                  <li><code style={codeStyle}>/config pyramid pick_z Z</code>{'  '}— 그리퍼 pick Z (base_link, m)</li>
                </ul>
                <div style={accordionSubHeaderStyle}>워크스페이스</div>
                <ul style={accordionListStyle}>
                  <li><code style={codeStyle}>/config workspace</code>{'  '}— 워크스페이스 한계 조회</li>
                </ul>
                <div style={accordionSubHeaderStyle}>기본값</div>
                <ul style={accordionListStyleTertiary}>
                  <li>cp = HOME EE 좌표 (lazy 초기화)</li>
                  <li>degree = 90° (행이 +y 방향)</li>
                  <li>pick_z = 0.313 m</li>
                </ul>
              </div>
            )}

            {/* ── Notes & API docs ───────────────────────────────── */}
            <AccordionHeader
              label="참고"
              hint="공통 노트 · API 문서"
              open={openSection === 'misc'}
              onClick={() => toggleSection('misc')}
              last
            />
            {openSection === 'misc' && (
              <div style={accordionBodyStyle}>
                <ul style={accordionListStyleTertiary}>
                  <li>위 직접 명령은 모두 접두 <code style={codeStyle}>/</code> 필수 — 예: <code style={codeStyle}>/pick</code>, <code style={codeStyle}>/pyramid 1l</code></li>
                  <li><code>/</code> 없는 일반 텍스트는 <strong>LLM 에이전트</strong>로 전송 (<code>/user_command</code> 토픽)</li>
                  <li><code style={codeStyle}>/help</code> — 전체 슬래시 명령어 목록 (로그 피드에 출력)</li>
                  <li><code>-z</code> 와 <code>--cup</code> 동시 지정 시 <code>-z</code> 우선</li>
                  <li><code>--cup</code> 의 Z 계산은 <code>cup_stack.skills.config</code> (ROS 2) 가 담당</li>
                  <li>로봇이 online 일 때만 실행 (offline 이면 경고만 표시)</li>
                  <li><kbd>↑</kbd>/<kbd>↓</kbd> 로 명령 히스토리 탐색</li>
                </ul>
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginTop: 4, color: 'var(--color-cyan)', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                  API 문서 · Swagger UI (/api/robot/docs) ↗
                </a>
              </div>
            )}
          </div>
        )}

        {/* Quick commands — preset agent command + direct full-teardown pipeline */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <button
            className="ds-btn sm"
            onClick={() => submit('3단 쌓아줘')}
            disabled={disabled}
            title="LLM 에이전트로 '3단 쌓아줘' 전송 → 3단 피라미드"
          >
            3단 쌓아줘
          </button>
          <button
            className="ds-btn sm"
            onClick={() => {
              // Autofill only — do NOT execute. Drop the command into the input
              // box and focus it; the skill starts only when the user presses
              // Enter / Send, so the destination can be reviewed/edited first.
              setValue('/unstack --all');
              setHistIdx(-1);
              inputRef.current?.focus();
            }}
            disabled={disabled}
            title="입력창에 /unstack --all 자동완성 (Send 를 눌러야 실행) → 6컵 전체 해체 → (0.40, 0.10)"
          >
            /unstack --all
          </button>
        </div>

        {/* Input row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            id="command-input"
            value={value}
            onChange={e => { setValue(e.target.value); setHistIdx(-1); }}
            onKeyDown={handleKey}
            disabled={disabled}
            placeholder="/help for commands · plain text → LLM agent"
            style={{
              flex: 1,
              background: 'var(--color-bg-surface-2)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--color-text-primary)',
              outline: 'none',
              caretColor: 'var(--color-cyan)',
              transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
            }}
            onFocus={e => {
              e.target.style.borderColor = 'var(--color-cyan)';
              e.target.style.boxShadow = '0 0 0 2px oklch(75% 0.18 200 / 0.15)';
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--color-border-default)';
              e.target.style.boxShadow = 'none';
            }}
          />
          <button
            className="ds-btn primary"
            onClick={() => submit()}
            disabled={disabled || !value.trim()}
          >
            Send ↵
          </button>
        </div>
      </div>
    </div>
  );
}
