"""
Health Report Image Generator  —  CJK-safe (WenQuanYi Zen Hei)
Input:  JSON via stdin   { period, clientName, mentorName, reportDate,
                           weight, scores, metrics, highlights, issues, actions }
Output: JPEG saved to path given as argv[1]
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import matplotlib.gridspec as gridspec
import matplotlib.font_manager as fm
import numpy as np
import json, sys, textwrap

# ── Font setup ────────────────────────────────────────────────────────────────
_WQY = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
_font_prop = fm.FontProperties(fname=_WQY)

def T(ax, x, y, s, **kw):
    """Text helper that always injects the CJK font."""
    kw.setdefault('fontproperties', _font_prop)
    return ax.text(x, y, s, **kw)

# ── Palette ───────────────────────────────────────────────────────────────────
C = dict(
    bg        = '#FFFFFF',
    card      = '#F7F9FC',
    header    = '#1A3A5C',
    accent    = '#1976D2',
    green     = '#2E7D32',
    green_lt  = '#E8F5E9',
    amber     = '#BF360C',
    amber_lt  = '#FFF3E0',
    red       = '#C62828',
    red_lt    = '#FFEBEE',
    purple    = '#6A1B9A',
    purple_lt = '#F3E5F5',
    teal      = '#00695C',
    teal_lt   = '#E0F2F1',
    gray      = '#546E7A',
    gray_lt   = '#ECEFF1',
    text      = '#212121',
    sub       = '#616161',
    line      = '#CFD8DC',
    gold      = '#E65100',
    bar_bg    = '#E0E0E0',
)

def score_color(s):
    if s is None:   return C['gray']
    if s >= 8:      return C['green']
    if s >= 6:      return C['accent']
    if s >= 4:      return C['amber']
    return C['red']

def score_label(s):
    if s is None: return 'N/A'
    if s >= 8:    return '优秀'
    if s >= 6:    return '良好'
    if s >= 4:    return '待改善'
    return '需关注'

def rounded_rect(ax, x, y, w, h, color, ec='none', lw=1.0, alpha=1.0, radius=0.02):
    p = FancyBboxPatch((x, y), w, h,
                       boxstyle=f"round,pad={radius}",
                       facecolor=color, edgecolor=ec, linewidth=lw, alpha=alpha)
    ax.add_patch(p)
    return p

def score_bar(ax, x, y, w, h, score, color):
    rounded_rect(ax, x, y, w, h, C['bar_bg'])
    if score:
        rounded_rect(ax, x, y, w * (score / 10), h, color, alpha=0.88)

def metric_card(fig, spec, label, score, details, color, color_lt):
    ax = fig.add_subplot(spec)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    rounded_rect(ax, 0.02, 0.04, 0.96, 0.93, color_lt, ec=color, lw=1.8, radius=0.03)

    col = score_color(score)
    T(ax, 0.07, 0.84, label, fontsize=11, fontweight='bold', color=color, va='center')

    # Score pill
    rounded_rect(ax, 0.66, 0.72, 0.30, 0.22, col, radius=0.03)
    T(ax, 0.81, 0.85, f'{score}/10' if score else 'N/A',
      fontsize=11, fontweight='bold', color='white', ha='center', va='center')
    T(ax, 0.81, 0.75, score_label(score),
      fontsize=7,  color='white', ha='center', va='center')

    score_bar(ax, 0.07, 0.59, 0.86, 0.10, score, col)

    y = 0.50
    for d in details[:3]:
        for line in textwrap.wrap(d, 36)[:2]:
            T(ax, 0.07, y, f'- {line}', fontsize=8.5, color=C['text'], va='top')
            y -= 0.13

# ── Main generator ─────────────────────────────────────────────────────────────
def generate_report(data: dict, out_path: str):
    period   = data.get('period', '14天')
    client   = data.get('clientName', 'Chloe')
    mentor   = data.get('mentorName', 'Anniisa')
    rdate    = data.get('reportDate', '')
    wt       = data.get('weight', {})
    scores   = data.get('scores', {})
    metrics  = data.get('metrics', {})
    hi       = data.get('highlights', [])
    issues   = data.get('issues', [])
    actions  = data.get('actions', [])

    # ── Canvas ────────────────────────────────────────────────────────────────
    fig = plt.figure(figsize=(10.8, 22.5), dpi=100, facecolor=C['bg'])
    fig.patch.set_facecolor(C['bg'])

    gs = gridspec.GridSpec(9, 1, figure=fig,
                           hspace=0.32, top=0.97, bottom=0.01,
                           left=0.04, right=0.96,
                           height_ratios=[1.1, 0.75, 1.7, 0.68, 1.5, 1.5, 1.5, 0.9, 0.35])

    # ── [0] HEADER ────────────────────────────────────────────────────────────
    ax = fig.add_subplot(gs[0])
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    rounded_rect(ax, 0, 0, 1, 1, C['header'], radius=0.04)

    T(ax, 0.5, 0.76, f'{client}  健康进度报告', fontsize=22,
      fontweight='bold', color='white', ha='center', va='center')
    T(ax, 0.5, 0.49, f'报告日期：{rdate}    周期：{period}',
      fontsize=11, color='#90CAF9', ha='center', va='center')
    T(ax, 0.5, 0.24, f'导师：{mentor}    AI 健康助理分析',
      fontsize=10, color='#78909C', ha='center', va='center')

    # ── [1] WEIGHT PROGRESS ───────────────────────────────────────────────────
    ax = fig.add_subplot(gs[1])
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    rounded_rect(ax, 0, 0.05, 1, 0.90, '#E3F2FD', ec=C['accent'], lw=1.5, radius=0.03)

    T(ax, 0.04, 0.78, '  体重变化', fontsize=11, fontweight='bold', color=C['accent'])

    w_s = wt.get('start', '–'); w_e = wt.get('end', '–'); w_d = wt.get('delta', '–')
    dcol = C['green'] if str(w_d).startswith('-') else C['red']

    for xpos, val, lbl in [(0.22,f'{w_s} kg','起始'), (0.50,'→',''),
                            (0.68,f'{w_e} kg','当前'), (0.87,f'{w_d} kg','变化')]:
        col = dcol if lbl == '变化' else (C['text'] if lbl == '当前' else C['sub'])
        fw  = 'bold' if lbl in ('当前','变化') else 'normal'
        T(ax, xpos, 0.40, val, fontsize=14, color=col, ha='center', va='center', fontweight=fw)
        if lbl:
            T(ax, xpos, 0.72, lbl, fontsize=8, color=C['sub'], ha='center')

    # ── [2] FOUR METRIC CARDS ────────────────────────────────────────────────
    inner = gridspec.GridSpecFromSubplotSpec(2, 2, subplot_spec=gs[2],
                                             hspace=0.22, wspace=0.12)
    cards = [
        ('饮食营养', scores.get('diet'), C['teal'], C['teal_lt'], [
            f"低GI餐点比例：{metrics.get('lowGIPct','–')}%",
            f"每日平均餐次：{metrics.get('avgMeals','–')} 次",
            metrics.get('dietNote','蔬菜摄取丰富'),
        ]),
        ('饮水量', scores.get('water'), C['accent'], '#E3F2FD', [
            f"平均每日：{metrics.get('avgWater','–')} ml",
            f"目标达标天：{metrics.get('waterGoalDays','–')} 天",
            '目标：2500 ml / 天',
        ]),
        ('睡眠', scores.get('sleep'), C['purple'], C['purple_lt'], [
            f"平均时长：{metrics.get('avgSleep','未记录')}",
            f"有记录天数：{metrics.get('sleepDays','–')} 天",
            metrics.get('sleepNote','睡眠数据待补充'),
        ]),
        ('运动', scores.get('exercise'), C['amber'], C['amber_lt'], [
            f"运动天数：{metrics.get('exerciseDays','–')} 天",
            metrics.get('exerciseNote','运动数据待补充'),
            '建议每周 3-5 次',
        ]),
    ]
    for i, (label, score, color, color_lt, details) in enumerate(cards):
        r, c = divmod(i, 2)
        metric_card(fig, inner[r, c], label, score, details, color, color_lt)

    # ── [3] MENTAL STATE ────────────────────────────────────────────────────
    ax = fig.add_subplot(gs[3])
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    rounded_rect(ax, 0, 0.05, 1, 0.90, '#FFF8E1', ec=C['gold'], lw=1.5, radius=0.03)

    ms = scores.get('mental'); mc = score_color(ms)
    T(ax, 0.04, 0.74, '  精神状态 & 执行力', fontsize=11, fontweight='bold', color=C['gold'])

    score_bar(ax, 0.04, 0.18, 0.68, 0.25, ms, mc)

    rounded_rect(ax, 0.76, 0.10, 0.21, 0.75, mc, radius=0.04)
    T(ax, 0.865, 0.60, f'{ms}/10' if ms else 'N/A',
      fontsize=13, fontweight='bold', color='white', ha='center', va='center')
    T(ax, 0.865, 0.26, score_label(ms),
      fontsize=8, color='white', ha='center', va='center')

    note = metrics.get('mentalNote','')
    if note:
        T(ax, 0.04, 0.06, note, fontsize=8, color=C['sub'], va='bottom')

    # ── Helper to draw a text-list card ──────────────────────────────────────
    def list_card(spec, title, items, bg, ec_col, bullet='* '):
        ax2 = fig.add_subplot(spec)
        ax2.set_xlim(0, 1); ax2.set_ylim(0, 1); ax2.axis('off')
        rounded_rect(ax2, 0, 0, 1, 1, bg, ec=ec_col, lw=1.5, radius=0.03)
        T(ax2, 0.04, 0.90, title, fontsize=12, fontweight='bold', color=ec_col)
        y = 0.76
        for item in items[:4]:
            txt = item.get('text', item) if isinstance(item, dict) else item
            lines = textwrap.wrap(str(txt), 52)
            T(ax2, 0.04, y, f'- {lines[0]}', fontsize=9.5,
              color=C['text'], va='top')
            if len(lines) > 1:
                T(ax2, 0.08, y - 0.105, lines[1], fontsize=9.5,
                  color=C['text'], va='top')
                y -= 0.07
            y -= 0.19

    # ── [4] HIGHLIGHTS ───────────────────────────────────────────────────────
    list_card(gs[4], '[★] 本期亮点', hi, C['green_lt'], C['green'], bullet='[+] ')

    # ── [5] ISSUES ──────────────────────────────────────────────────────────
    list_card(gs[5], '[!] 需要改善', issues, C['amber_lt'], C['amber'], bullet='[!] ')

    # ── [6] ACTION PLAN ─────────────────────────────────────────────────────
    ax = fig.add_subplot(gs[6])
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    rounded_rect(ax, 0, 0, 1, 1, '#E8EAF6', ec='#3949AB', lw=1.5, radius=0.03)
    T(ax, 0.04, 0.90, '[目标] 接下来行动计划', fontsize=12, fontweight='bold', color='#3949AB')
    y = 0.76
    p_map = {'high': '[高]', 'medium': '[中]', 'low': '[低]'}
    p_col = {'high': C['red'], 'medium': C['amber'], 'low': C['green']}
    for act in actions[:4]:
        if isinstance(act, dict):
            pri  = act.get('priority', 'medium')
            txt  = act.get('text', '')
        else:
            pri, txt = 'medium', str(act)
        tag  = p_map.get(pri, '[中]')
        tcol = p_col.get(pri, C['amber'])
        lines = textwrap.wrap(txt, 50)
        T(ax, 0.04, y, f'{tag}  {lines[0]}', fontsize=9.5, color=C['text'], va='top')
        # colour the tag separately
        T(ax, 0.04, y, tag, fontsize=9.5, color=tcol, va='top', fontweight='bold')
        if len(lines) > 1:
            T(ax, 0.10, y - 0.105, lines[1], fontsize=9.5, color=C['text'], va='top')
            y -= 0.07
        y -= 0.19

    # ── [7] OVERALL SCORES ─────────────────────────────────────────────────
    ax = fig.add_subplot(gs[7])
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    rounded_rect(ax, 0, 0.04, 1, 0.93, C['card'], ec=C['line'], lw=1, radius=0.03)
    T(ax, 0.04, 0.86, '综合评分', fontsize=11, fontweight='bold', color=C['text'])

    score_items = [('饮食', scores.get('diet')),
                   ('水分', scores.get('water')),
                   ('睡眠', scores.get('sleep')),
                   ('运动', scores.get('exercise')),
                   ('状态', scores.get('mental'))]
    x = 0.04
    for lbl, s in score_items:
        col = score_color(s); val = f'{s}/10' if s else 'N/A'
        rounded_rect(ax, x, 0.10, 0.16, 0.55, col, alpha=0.14, radius=0.03)
        T(ax, x+0.08, 0.50, val, fontsize=10, fontweight='bold',
          color=col, ha='center', va='center')
        T(ax, x+0.08, 0.23, lbl, fontsize=8, color=C['sub'],
          ha='center', va='center')
        x += 0.18

    ov = scores.get('overall'); oc = score_color(ov)
    rounded_rect(ax, 0.82, 0.08, 0.16, 0.60, oc, radius=0.03)
    T(ax, 0.90, 0.57, f'{ov}/10' if ov else 'N/A',
      fontsize=14, fontweight='bold', color='white', ha='center', va='center')
    T(ax, 0.90, 0.24, '综合', fontsize=9, color='white',
      ha='center', va='center')

    # ── [8] FOOTER ──────────────────────────────────────────────────────────
    ax = fig.add_subplot(gs[8])
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    T(ax, 0.5, 0.68, f'由 {mentor} 导师  x  AI 健康助理  联合分析',
      fontsize=9, color=C['sub'], ha='center')
    T(ax, 0.5, 0.22, '30-Day Metabolism & Blood Sugar Programme',
      fontsize=8, color='#B0BEC5', ha='center')

    plt.savefig(out_path, format='jpeg', dpi=100,
                bbox_inches='tight', facecolor=C['bg'])
    plt.close(fig)


if __name__ == '__main__':
    raw  = sys.stdin.read().strip()
    data = json.loads(raw)
    out  = sys.argv[1] if len(sys.argv) > 1 else '/tmp/report.jpg'
    generate_report(data, out)
    print(out)
