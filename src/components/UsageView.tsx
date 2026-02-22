import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../store'
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} from 'recharts'

// Helper for formatting large numbers
function formatNumber(n: number) {
    if (n === undefined || n === null) return '0'
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
    return new Intl.NumberFormat('en-US').format(n)
}

function formatCurrency(n: number) {
    if (n === undefined || n === null) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}

const CustomLegend = (props: any) => {
    const { payload } = props;
    return (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {payload.map((entry: any, index: number) => (
                <li key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <div style={{ width: '12px', height: '12px', backgroundColor: entry.color, borderRadius: '4px', marginRight: '6px' }} />
                    {entry.value}
                </li>
            ))}
        </ul>
    )
}

const CustomTooltip = ({ active, payload, label, graphMode }: any) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ backgroundColor: '#111315', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '12px', zIndex: 100, boxShadow: '0 8px 16px rgba(0, 0, 0, 0.5)' }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#ffffff' }}>{label}</p>
                {payload.map((entry: any, index: number) => (
                    <p key={index} style={{ margin: '4px 0', color: entry.color, fontSize: '13px', fontWeight: 600 }}>
                        {entry.name}: {graphMode === 'tokens' ? formatNumber(entry.value) : formatCurrency(entry.value)}
                    </p>
                ))}
            </div>
        )
    }
    return null
}

export function UsageView() {
    const { client, closeDetailView } = useStore()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [usageData, setUsageData] = useState<any>(null)
    const [graphMode, setGraphMode] = useState<'tokens' | 'cost'>('tokens')

    useEffect(() => {
        if (!client) return
        const fetchUsage = async () => {
            try {
                setLoading(true)
                const [status, cost] = await Promise.all([
                    client.getUsageStatus().catch(() => null),
                    client.getUsageCost().catch(() => null)
                ])
                setUsageData({ status, cost })
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch usage')
            } finally {
                setLoading(false)
            }
        }
        fetchUsage()
    }, [client])

    const totalCost = usageData?.cost?.daily?.reduce((acc: number, day: any) => acc + (day.totalCost || 0), 0) || 0
    const totalTokens = usageData?.cost?.daily?.reduce((acc: number, day: any) => acc + (day.totalTokens || 0), 0) || 0

    const chartData = useMemo(() => {
        if (!usageData?.cost?.daily) return []
        // we want chronological order for the chart
        const sorted = [...usageData.cost.daily].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        return sorted.map(day => ({
            ...day,
            dateShort: day.date.split('-').slice(1).join('/')
        }))
    }, [usageData])

    const heatMapData = useMemo(() => {
        if (!usageData?.cost?.daily) return { data: [], max: 0 }
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const agg: { [key: string]: number } = {}
        let maxTokens = 0
        usageData.cost.daily.forEach((day: any) => {
            const d = new Date(day.date + 'T00:00:00')
            const dayName = days[d.getDay()]
            agg[dayName] = (agg[dayName] || 0) + (day.totalTokens || 0)
        })
        const result = days.map(day => {
            const val = agg[day] || 0
            if (val > maxTokens) maxTokens = val
            return { day, tokens: val }
        })
        return { data: result, max: maxTokens }
    }, [usageData])

    return (
        <div className="detail-view" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
            <div className="detail-header">
                <button className="detail-back" onClick={closeDetailView} aria-label="Back to chat">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    <span>Back</span>
                </button>
                <div className="detail-title-section">
                    <div className="detail-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                            <path d="M22 6s-2-2-4-2-4 2-4 2" />
                            <path d="M2 12h20 M12 2v20" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="detail-title">Usage & Status</h1>
                        <p className="detail-subtitle">View your server limits, tokens, and cost usage.</p>
                    </div>
                </div>
            </div>

            <div className="detail-content" style={{ padding: '0 24px 24px 24px', overflowY: 'auto' }}>
                {loading ? (
                    <div className="settings-loading">Loading usage...</div>
                ) : error ? (
                    <div className="settings-error">{error}</div>
                ) : !usageData ? (
                    <div className="empty-panel"><p>No usage data available.</p></div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingTop: '16px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>

                        {usageData.cost && (
                            <section className="detail-section" style={{ margin: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>
                                    <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Usage Patterns</h2>
                                    <div style={{ display: 'flex', gap: '8px', background: 'var(--base-02)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <button
                                            onClick={() => setGraphMode('tokens')}
                                            style={{ padding: '4px 12px', border: 'none', background: graphMode === 'tokens' ? 'var(--primary)' : 'transparent', color: graphMode === 'tokens' ? 'white' : 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                        >
                                            Tokens
                                        </button>
                                        <button
                                            onClick={() => setGraphMode('cost')}
                                            style={{ padding: '4px 12px', border: 'none', background: graphMode === 'cost' ? 'var(--primary)' : 'transparent', color: graphMode === 'cost' ? 'white' : 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                        >
                                            Cost
                                        </button>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                    <div style={{ background: 'var(--base-02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>Total Cost ({usageData.cost.days || 30} days)</div>
                                        <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(totalCost)}</div>
                                    </div>
                                    <div style={{ background: 'var(--base-02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                        <div style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>Total Tokens</div>
                                        <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatNumber(totalTokens)}</div>
                                    </div>
                                </div>

                                {heatMapData.data.length > 0 && (
                                    <div style={{ marginBottom: '32px' }}>
                                        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Activity by Time: Day of Week</h3>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {heatMapData.data.map((item) => {
                                                const intensity = heatMapData.max > 0 ? item.tokens / heatMapData.max : 0
                                                // Calculate background color, interpolating from light red (pink) to solid red
                                                const bg = `rgba(239, 68, 68, ${0.1 + (intensity * 0.9)})`
                                                const textColor = intensity > 0.6 ? '#ffffff' : 'var(--text-primary)'
                                                return (
                                                    <div key={item.day} style={{ flex: '1 1 calc(100% / 7 - 8px)', minWidth: '60px', background: bg, padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 600, color: textColor, opacity: 0.8, marginBottom: '4px' }}>{item.day}</div>
                                                        <div style={{ fontSize: '16px', fontWeight: 700, color: textColor }}>{formatNumber(item.tokens)}</div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {chartData.length > 0 && (
                                    <div style={{ width: '100%', height: '300px', marginBottom: '32px', padding: '16px', background: 'var(--base-01)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                                <XAxis dataKey="dateShort" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} style={{ fontFamily: '"Space Grotesk", sans-serif' }} />
                                                <YAxis
                                                    stroke="var(--text-secondary)"
                                                    fontSize={12}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    style={{ fontFamily: '"Space Grotesk", sans-serif' }}
                                                    tickFormatter={(val) => graphMode === 'tokens' ? formatNumber(val) : formatCurrency(val)}
                                                />
                                                <Tooltip content={<CustomTooltip graphMode={graphMode} />} cursor={{ fill: 'var(--base-02)', opacity: 0.4 }} />
                                                <Legend wrapperStyle={{ paddingTop: '16px' }} content={<CustomLegend />} />

                                                {graphMode === 'tokens' ? (
                                                    <>
                                                        <Bar dataKey="cacheRead" name="Cache Read" stackId="a" fill="#06b6d4" />
                                                        <Bar dataKey="input" name="Input Tokens" stackId="a" fill="#f59e0b" />
                                                        <Bar dataKey="cacheWrite" name="Cache Write" stackId="a" fill="#10b981" />
                                                        <Bar dataKey="output" name="Output Tokens" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                                    </>
                                                ) : (
                                                    <Bar dataKey="totalCost" name="Daily Cost" fill="#ef4444" radius={[4, 4, 4, 4]} />
                                                )}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}

                                {usageData.cost.daily && usageData.cost.daily.length > 0 && (
                                    <div style={{ width: '100%', overflowX: 'auto', background: 'var(--base-01)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'right' }}>
                                            <thead style={{ background: 'var(--base-02)', borderBottom: '1px solid var(--border-color)' }}>
                                                <tr>
                                                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Date</th>
                                                    <th style={{ padding: '12px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Input</th>
                                                    <th style={{ padding: '12px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Output</th>
                                                    <th style={{ padding: '12px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Cache Read</th>
                                                    <th style={{ padding: '12px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Cache Write</th>
                                                    <th style={{ padding: '12px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Tokens</th>
                                                    <th style={{ padding: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {usageData.cost.daily.slice().reverse().map((day: any, i: number) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ padding: '12px', textAlign: 'left', color: 'var(--text-primary)' }}>{day.date}</td>
                                                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{formatNumber(day.input)}</td>
                                                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{formatNumber(day.output)}</td>
                                                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{formatNumber(day.cacheRead)}</td>
                                                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{formatNumber(day.cacheWrite)}</td>
                                                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{formatNumber(day.totalTokens)}</td>
                                                        <td style={{ padding: '12px', color: 'var(--primary)', fontWeight: 600 }}>{formatCurrency(day.totalCost)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        )}

                        {usageData.status && (
                            <section className="detail-section" style={{ margin: 0 }}>
                                <h2 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '16px' }}>Status Limits & Providers</h2>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                                    {Object.entries(usageData.status).map(([key, val]) => (
                                        <div key={key} style={{ background: 'var(--base-01)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>{key}</div>
                                            {key === 'providers' && Array.isArray(val) ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {val.map((provider: any, idx: number) => (
                                                        <div key={idx} style={{ background: 'var(--base-02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{provider.displayName || provider.provider}</div>
                                                                {provider.plan && <div style={{ fontSize: '12px', background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>{provider.plan}</div>}
                                                            </div>
                                                            {provider.windows && provider.windows.length > 0 && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                    {provider.windows.map((win: any, wIdx: number) => (
                                                                        <div key={wIdx}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                                                                                <span style={{ color: 'var(--text-secondary)' }}>{win.label} Limit</span>
                                                                                <span style={{ color: win.usedPercent > 90 ? '#ef4444' : 'var(--text-primary)' }}>
                                                                                    {win.usedPercent}% <span style={{ opacity: 0.5, marginLeft: '4px' }}>(Resets: {new Date(win.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                                                                                <div style={{
                                                                                    height: '100%',
                                                                                    background: win.usedPercent > 90 ? '#ef4444' : win.usedPercent > 70 ? '#f59e0b' : '#10b981',
                                                                                    width: `${Math.min(100, win.usedPercent)}%`,
                                                                                    transition: 'width 0.3s ease'
                                                                                }} />
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : typeof val === 'object' && val !== null ? (
                                                <pre style={{ margin: 0, padding: '12px', background: 'var(--base-02)', borderRadius: '6px', overflowX: 'auto', fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                                                    {JSON.stringify(val, null, 2)}
                                                </pre>
                                            ) : (
                                                <div style={{ fontSize: '16px', color: 'var(--text-primary)' }}>
                                                    {key === 'updatedAt' && typeof val === 'number' ? new Date(val).toLocaleString() : String(val)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                    </div>
                )}
            </div>
        </div>
    )
}
