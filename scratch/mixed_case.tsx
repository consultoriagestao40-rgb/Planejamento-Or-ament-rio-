        case 'MIXED': {
            const yBaseline = 210;

            const getDaysInMonth = (mNum: number) => {
                return new Date(year, mNum, 0).getDate();
            };

            const getAbsValue = (val: number, mode: string, mIdx: number) => {
                if (mode === 'diarias_bar' || mode === 'diarias_line') {
                    const days = getDaysInMonth(mIdx + 1);
                    return val / days;
                }
                return val;
            };

            const isDailyMode = (mode: string) => {
                return mode === 'diarias_bar' || mode === 'diarias_line';
            };

            const formatAbs = (val: number, isDaily: boolean = false) => {
                if (val === 0) return 'R$ 0';
                const absVal = Math.abs(val);
                let formatted = '';
                if (absVal < 1000) {
                    formatted = absVal.toFixed(0);
                } else if (absVal < 1_000_000) {
                    formatted = (absVal / 1000).toFixed(1) + 'k';
                } else {
                    formatted = (absVal / 1_000_000).toFixed(2) + 'M';
                }
                return `${val < 0 ? '-' : ''}R$ ${formatted}${isDaily ? '/d' : ''}`;
            };

            const bMode = hiddenSeries.budget ? 'none' : (config?.budget || 'bar');
            const rMode = hiddenSeries.realized ? 'none' : (config?.realized || 'bar');
            const atMode = hiddenSeries.atingido ? 'none' : (config?.atingido || 'none');
            const pctMode = hiddenSeries.pctOfRevenue ? 'none' : (config?.pctOfRevenue || 'none');

            const hasDailyActive = isDailyMode(bMode) || isDailyMode(rMode);

            let maxAbs = 1;
            data.forEach((m, idx) => {
                if (bMode !== 'none') {
                    const bVal = getAbsValue(m.budget, bMode, idx);
                    maxAbs = Math.max(maxAbs, Math.abs(bVal));
                    if (isRatioChart) {
                        const cbVal = getAbsValue(m.compareBudget || 0, bMode, idx);
                        maxAbs = Math.max(maxAbs, Math.abs(cbVal));
                    }
                }
                if (rMode !== 'none' && idx + 1 <= currentMonthIdx + 1) {
                    const rVal = getAbsValue(m.realized, rMode, idx);
                    maxAbs = Math.max(maxAbs, Math.abs(rVal));
                    if (isRatioChart) {
                        const crVal = getAbsValue(m.compareRealized || 0, rMode, idx);
                        maxAbs = Math.max(maxAbs, Math.abs(crVal));
                    }
                }
            });
            const scaleMaxAbs = maxAbs * 1.20;

            let maxPct = 5;
            data.forEach((m, idx) => {
                if (idx + 1 <= currentMonthIdx + 1) {
                    if (atMode !== 'none') {
                        maxPct = Math.max(maxPct, Math.abs(m.atingido));
                    }
                    if (pctMode !== 'none') {
                        maxPct = Math.max(maxPct, Math.abs(m.pctOfRevenue));
                    }
                }
                if (pctMode !== 'none' && !onlyRealized) {
                    maxPct = Math.max(maxPct, Math.abs(m.pctOfRevenueBudget || 0));
                }
            });
            const scaleMaxPct = maxPct * 1.15;

            const getYAbs = (val: number) => {
                const ratio = val / scaleMaxAbs;
                return yBaseline - ratio * 170;
            };

            const getYPct = (val: number) => {
                const ratio = val / scaleMaxPct;
                return yBaseline - ratio * 170;
            };

            const startX = 80;
            const stepX = 94;
            const getX = (idx: number) => startX + idx * stepX;

            const renderLineSeries = (key: string, strokeColor: string, isDash: boolean = false) => {
                const points: { x: number; y: number; val: number }[] = [];
                const isBudget = key === 'budget' || key === 'compareBudget';
                const mode = isBudget ? bMode : rMode;
                const showLabel = isBudget 
                    ? config?.showBudgetLabels !== 'false' 
                    : config?.showRealizedLabels !== 'false';
                
                data.forEach((m, monthIdx) => {
                    const val = m[key] || 0;
                    if (isBudget || (monthIdx + 1 <= currentMonthIdx + 1)) {
                        const valScaled = getAbsValue(val, mode, monthIdx);
                        points.push({
                            x: getX(monthIdx),
                            y: getYAbs(valScaled),
                            val: valScaled
                        });
                    }
                });

                if (points.length === 0) return null;

                let pathD = `M ${points[0].x} ${points[0].y}`;
                for (let i = 1; i < points.length; i++) {
                    pathD += ` L ${points[i].x} ${points[i].y}`;
                }

                return (
                    <g key={`${key}-line`}>
                        <path 
                            d={pathD} 
                            fill="none" 
                            stroke={strokeColor} 
                            strokeWidth="2.5" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeDasharray={isDash ? '4 4' : undefined}
                        />
                        {points.map((p, idx) => (
                            <g key={idx}>
                                <circle cx={p.x} cy={p.y} r="4.5" fill="#ffffff" stroke={strokeColor} strokeWidth="2.5" />
                                {showLabel && p.val !== 0 && (
                                    <text 
                                        x={p.x} 
                                        y={p.y - 10} 
                                        textAnchor="middle" 
                                        fill="var(--text-secondary)" 
                                        fontSize="9px" 
                                        fontWeight="700"
                                        style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                    >
                                        {formatAbs(p.val, isDailyMode(mode))}
                                    </text>
                                )}
                            </g>
                        ))}
                    </g>
                );
            };

            // RENDER BARS (bar, diarias_bar)
            const activeBarKeys: string[] = [];
            if (isRatioChart) {
                if (!hideBudget && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('budget', 'compareBudget');
                if (!hideRealized && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('realized', 'compareRealized');
            } else {
                if (!hideBudget && (bMode === 'bar' || bMode === 'diarias_bar')) activeBarKeys.push('budget');
                if (!hideRealized && (rMode === 'bar' || rMode === 'diarias_bar')) activeBarKeys.push('realized');
            }

            const renderedBars = data.map((m, monthIdx) => {
                const xCenter = getX(monthIdx);
                const numBars = activeBarKeys.length;
                if (numBars === 0) return null;

                const groupWidth = 76;
                const barWidth = Math.max(16, (groupWidth / numBars) - 4);
                const startBarX = xCenter - (groupWidth / 2);

                return activeBarKeys.map((key, keyIdx) => {
                    const isBudget = key === 'budget' || key === 'compareBudget';
                    const mode = isBudget ? bMode : rMode;
                    const val = m[key] || 0;
                    const valScaled = getAbsValue(val, mode, monthIdx);

                    const barX = startBarX + keyIdx * (barWidth + 4);
                    const isPositive = valScaled >= 0;
                    const hVal = Math.max(2, Math.abs(getYAbs(valScaled) - yBaseline));
                    const yVal = isPositive ? yBaseline - hVal : yBaseline;

                    let fill = '#cbd5e1';
                    if (key === 'budget') fill = '#cbd5e1';
                    else if (key === 'realized') fill = valScaled >= 0 ? chartColor : 'var(--accent-red)';
                    else if (key === 'compareBudget') fill = '#fed7aa';
                    else if (key === 'compareRealized') fill = valScaled >= 0 ? '#f97316' : 'var(--accent-red)';

                    const shouldShow = isBudget || (monthIdx + 1 <= currentMonthIdx + 1);

                    const showLabel = isBudget 
                        ? config?.showBudgetLabels !== 'false' 
                        : config?.showRealizedLabels !== 'false';

                    return (
                        <g key={`${monthIdx}-${key}`}>
                            {shouldShow && valScaled !== 0 && (
                                <>
                                    <rect 
                                        x={barX} 
                                        y={yVal} 
                                        width={barWidth} 
                                        height={hVal} 
                                        fill={fill} 
                                        rx="3"
                                    />
                                    {showLabel && (
                                        <text 
                                            x={barX + barWidth / 2} 
                                            y={isPositive ? yVal - 7 : yVal + hVal + 14} 
                                            textAnchor="middle" 
                                            fill="var(--text-secondary)" 
                                            fontSize="9px" 
                                            fontWeight="700"
                                            style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                        >
                                            {formatAbs(valScaled, isDailyMode(mode))}
                                        </text>
                                    )}
                                </>
                            )}
                        </g>
                    );
                });
            });

            // RENDER LEFT AXIS LINES (line_val, diarias_line)
            const leftLines: JSX.Element[] = [];

            if (isRatioChart) {
                if (!hideBudget && (bMode === 'line_val' || bMode === 'diarias_line')) {
                    const l = renderLineSeries('budget', '#94a3b8', true);
                    if (l) leftLines.push(l);
                    const lc = renderLineSeries('compareBudget', '#fed7aa', true);
                    if (lc) leftLines.push(lc);
                }
                if (!hideRealized && (rMode === 'line_val' || rMode === 'diarias_line')) {
                    const l = renderLineSeries('realized', chartColor);
                    if (l) leftLines.push(l);
                    const lc = renderLineSeries('compareRealized', '#f97316');
                    if (lc) leftLines.push(lc);
                }
            } else {
                if (!hideBudget && (bMode === 'line_val' || bMode === 'diarias_line')) {
                    const l = renderLineSeries('budget', '#94a3b8', true);
                    if (l) leftLines.push(l);
                }
                if (!hideRealized && (rMode === 'line_val' || rMode === 'diarias_line')) {
                    const l = renderLineSeries('realized', chartColor);
                    if (l) leftLines.push(l);
                }
            }

            // RENDER RIGHT AXIS LINES (% lines)
            const rightLines: JSX.Element[] = [];

            if (atMode === 'line_atingido') {
                const points: { x: number; y: number; val: number }[] = [];
                data.forEach((m, monthIdx) => {
                    if (monthIdx + 1 <= currentMonthIdx + 1) {
                        points.push({
                            x: getX(monthIdx),
                            y: getYPct(m.atingido),
                            val: m.atingido
                        });
                    }
                });

                if (points.length > 0) {
                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }
                    const lineColor = '#10b981';
                    rightLines.push(
                        <g key="atingido-line">
                            <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            {points.map((p, idx) => (
                                <g key={idx}>
                                    <circle cx={p.x} cy={p.y} r="4.5" fill={lineColor} stroke="var(--bg-surface)" strokeWidth="1.5" />
                                    {config?.showAtingidoLabels !== 'false' && (
                                        <text 
                                            x={p.x} 
                                            y={p.y - 10} 
                                            textAnchor="middle" 
                                            fill={lineColor} 
                                            fontSize="9px" 
                                            fontWeight="800"
                                            style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                        >
                                            {p.val.toFixed(1)}%
                                        </text>
                                    )}
                                </g>
                            ))}
                        </g>
                    );
                }
            }

            if (pctMode === 'line_revenue') {
                if (!onlyRealized) {
                    const pointsB: { x: number; y: number; val: number }[] = [];
                    data.forEach((m, monthIdx) => {
                        pointsB.push({
                            x: getX(monthIdx),
                            y: getYPct(m.pctOfRevenueBudget || 0),
                            val: m.pctOfRevenueBudget || 0
                        });
                    });

                    if (pointsB.length > 0) {
                        let pathD = `M ${pointsB[0].x} ${pointsB[0].y}`;
                        for (let i = 1; i < pointsB.length; i++) {
                            pathD += ` L ${pointsB[i].x} ${pointsB[i].y}`;
                        }
                        const lineColor = '#fed7aa';
                        rightLines.push(
                            <g key="pct-revenue-budget-line">
                                <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />
                                {pointsB.map((p, idx) => (
                                    <g key={idx}>
                                        <circle cx={p.x} cy={p.y} r="4.5" fill={lineColor} stroke="var(--bg-surface)" strokeWidth="1.5" />
                                        {config?.showPctOfRevenueLabels !== 'false' && p.val !== 0 && (
                                            <text 
                                                x={p.x} 
                                                y={p.y - 10} 
                                                textAnchor="middle" 
                                                fill={lineColor} 
                                                fontSize="9px" 
                                                fontWeight="800"
                                                style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                            >
                                                {p.val.toFixed(1)}%
                                            </text>
                                        )}
                                    </g>
                                ))}
                            </g>
                        );
                    }
                }

                const points: { x: number; y: number; val: number }[] = [];
                data.forEach((m, monthIdx) => {
                    if (monthIdx + 1 <= currentMonthIdx + 1) {
                        points.push({
                            x: getX(monthIdx),
                            y: getYPct(m.pctOfRevenue || 0),
                            val: m.pctOfRevenue || 0
                        });
                    }
                });

                if (points.length > 0) {
                    let pathD = `M ${points[0].x} ${points[0].y}`;
                    for (let i = 1; i < points.length; i++) {
                        pathD += ` L ${points[i].x} ${points[i].y}`;
                    }

                    const lineColor = '#f59e0b';

                    rightLines.push(
                        <g key="pct-revenue-line">
                            <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            {points.map((p, idx) => (
                                <g key={idx}>
                                    <circle cx={p.x} cy={p.y} r="4.5" fill={lineColor} stroke="var(--bg-surface)" strokeWidth="1.5" />
                                    {config?.showPctOfRevenueLabels !== 'false' && p.val !== 0 && (
                                        <text 
                                            x={p.x} 
                                            y={p.y - 10} 
                                            textAnchor="middle" 
                                            fill={lineColor} 
                                            fontSize="9px" 
                                            fontWeight="800"
                                            style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3.5, strokeLinejoin: 'round' }}
                                        >
                                            {p.val.toFixed(1)}%
                                        </text>
                                    )}
                                </g>
                            ))}
                        </g>
                    );
                }
            }

            return (
                <svg viewBox="-70 0 1290 260" width="100%" height="auto" style={{ overflow: 'visible' }}>
                    {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, gridIdx) => {
                        const yGrid = yBaseline - ratio * 170;
                        return (
                            <line key={gridIdx} x1="40" y1={yGrid} x2="1160" y2={yGrid}
                                stroke={ratio === 0 ? 'var(--border-default)' : 'var(--border-subtle)'}
                                strokeWidth={ratio === 0 ? 1 : 0.5}
                                strokeDasharray={ratio === 0 ? undefined : '3 3'}
                            />
                        );
                    })}

                    <line x1="40" y1="0" x2="40" y2={yBaseline} stroke="var(--border-default)" strokeWidth="1" />
                    <line x1="1160" y1="0" x2="1160" y2={yBaseline} stroke="var(--border-default)" strokeWidth="1" />
                    <line x1="40" y1={yBaseline} x2="1160" y2={yBaseline} stroke="var(--border-default)" strokeWidth="1" />

                    {renderedBars}
                    {leftLines}
                    {rightLines}

                    {[0.25, 0.5, 0.75, 1.0].map((ratio, gridIdx) => {
                        const yGrid = yBaseline - ratio * 170;
                        return (
                            <g key={`label-${gridIdx}`}>
                                <text x="32" y={yGrid + 4} textAnchor="end" fill="var(--text-muted)" fontSize="11px" fontWeight="600"
                                    style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                    {formatAbs(ratio * scaleMaxAbs, hasDailyActive)}
                                </text>
                                <text x="1168" y={yGrid + 4} textAnchor="start" fill="var(--text-muted)" fontSize="11px" fontWeight="600"
                                    style={{ paintOrder: 'stroke', stroke: 'var(--bg-surface)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                                    {(ratio * scaleMaxPct).toFixed(0)}%
                                </text>
                            </g>
                        );
                    })}

                    {data.map((m, idx) => (
                        <text key={idx} x={getX(idx)} y={yBaseline + 20} textAnchor="middle" fill="var(--text-secondary)" fontSize="13px" fontWeight="800">
                            {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][idx]}
                        </text>
                    ))}

                    {onHover && data.map((m, idx) => (
                        <rect
                            key={`hover-${idx}`}
                            x={getX(idx) - stepX / 2}
                            y={0}
                            width={stepX}
                            height={yBaseline + 30}
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onMouseMove={(e) => {
                                const items = [];
                                if (bMode !== 'none') {
                                    const label = isRatioChart ? `${baseLabel || 'Base'} (Orçado)` : 'Orçado';
                                    items.push({ 
                                        label, 
                                        value: formatAbs(getAbsValue(m.budget, bMode, idx), isDailyMode(bMode)), 
                                        color: '#cbd5e1' 
                                    });
                                }
                                if (rMode !== 'none' && idx + 1 <= currentMonthIdx + 1) {
                                    const label = isRatioChart ? `${baseLabel || 'Base'} (Realizado)` : 'Realizado';
                                    items.push({ 
                                        label, 
                                        value: formatAbs(getAbsValue(m.realized, rMode, idx), isDailyMode(rMode)), 
                                        color: chartColor 
                                    });
                                }
                                if (isRatioChart) {
                                    if (bMode !== 'none') {
                                        items.push({ 
                                            label: `${compareLabel || 'Comp'} (Orçado)`, 
                                            value: formatAbs(getAbsValue(m.compareBudget, bMode, idx), isDailyMode(bMode)), 
                                            color: '#fed7aa' 
                                        });
                                    }
                                    if (rMode !== 'none' && idx + 1 <= currentMonthIdx + 1) {
                                        items.push({ 
                                            label: `${compareLabel || 'Comp'} (Realizado)`, 
                                            value: formatAbs(getAbsValue(m.compareRealized, rMode, idx), isDailyMode(rMode)), 
                                            color: '#f97316' 
                                        });
                                    }
                                }
                                if (atMode !== 'none' && idx + 1 <= currentMonthIdx + 1) {
                                    items.push({ 
                                        label: isRatioChart ? 'Razão %' : 'Atingido', 
                                        value: `${m.atingido.toFixed(1)}%`, 
                                        color: '#10b981' 
                                    });
                                }
                                if (pctMode !== 'none') {
                                    if (!onlyRealized) {
                                        items.push({ 
                                            label: '% s/ Receita (Orçado)', 
                                            value: `${(m.pctOfRevenueBudget || 0).toFixed(1)}%`, 
                                            color: '#fed7aa' 
                                        });
                                    }
                                    if (idx + 1 <= currentMonthIdx + 1) {
                                        items.push({ 
                                            label: '% s/ Receita (Realizado)', 
                                            value: `${(m.pctOfRevenue || 0).toFixed(1)}%`, 
                                            color: '#f59e0b' 
                                        });
                                    }
                                }

                                onHover({
                                    x: e.clientX,
                                    y: e.clientY,
                                    title: `${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][idx]} de ${year}`,
                                    items
                                });
                            }}
                            onMouseLeave={() => onHover(null)}
                        />
                        )
                    )}
                </svg>
            );
        }

