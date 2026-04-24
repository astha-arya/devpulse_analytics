import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { analyticsService } from '../services/analyticsService';
import toast from 'react-hot-toast';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from 'react-simple-maps';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import { ArrowLeft, MousePointerClick, Monitor, Smartphone, Tablet, HelpCircle, Globe, Plus, Minus, RotateCcw, Users } from 'lucide-react';

// Public CDN-hosted world topojson — no extra file needed
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface AnalyticsData {
  shortId: string;
  totalClicks: number;
  uniqueClicks: number; // Phase 4
  deviceBreakdown: {
    Desktop: number;
    Mobile: number;
    Tablet: number;
    Other: number;
  };
  clicksByDate: Array<{ date: string; clicks: number }>;
  recentClicks: Array<{
    ip: string;
    userAgent: string;
    referrer: string;
    timestamp: string;
  }>;
  locations: Record<string, number>;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

const DEVICE_ICONS: Record<string, any> = {
  Desktop: Monitor,
  Mobile: Smartphone,
  Tablet: Tablet,
  Other: HelpCircle,
};

const renderCustomLabel = (props: any) => {
  const { name, percent } = props;
  if (!percent || percent === 0) return null;
  return `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`;
};

// ---------------------------------------------------------------------------
// Colour scale helpers
// ---------------------------------------------------------------------------
const BLUE_SCALE = [
  '#dbeafe', // 50  — 1 click
  '#bfdbfe', // 100
  '#93c5fd', // 300
  '#60a5fa', // 400
  '#3b82f6', // 500
  '#2563eb', // 600
  '#1d4ed8', // 700
  '#1e40af', // 800 — heavy traffic
];

function getCountryColor(clicks: number, maxClicks: number): string {
  if (!clicks || clicks === 0) return '#e5e7eb'; // gray-200 — no data
  const ratio = clicks / maxClicks;
  const index = Math.min(
    Math.floor(ratio * (BLUE_SCALE.length - 1)),
    BLUE_SCALE.length - 1
  );
  return BLUE_SCALE[index];
}

const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004':'AF','008':'AL','012':'DZ','024':'AO','032':'AR','036':'AU','040':'AT',
  '050':'BD','056':'BE','068':'BO','076':'BR','100':'BG','116':'KH','120':'CM',
  '124':'CA','144':'LK','152':'CL','156':'CN','170':'CO','180':'CD','188':'CR',
  '191':'HR','192':'CU','196':'CY','203':'CZ','208':'DK','214':'DO','218':'EC',
  '818':'EG','222':'SV','231':'ET','246':'FI','250':'FR','266':'GA','276':'DE',
  '288':'GH','300':'GR','320':'GT','332':'HT','340':'HN','348':'HU','356':'IN',
  '360':'ID','364':'IR','368':'IQ','372':'IE','376':'IL','380':'IT','388':'JM',
  '392':'JP','400':'JO','398':'KZ','404':'KE','408':'KP','410':'KR','414':'KW',
  '418':'LA','422':'LB','430':'LR','434':'LY','458':'MY','484':'MX','504':'MA',
  '508':'MZ','516':'NA','524':'NP','528':'NL','554':'NZ','558':'NI','566':'NG',
  '578':'NO','586':'PK','591':'PA','604':'PE','608':'PH','616':'PL','620':'PT',
  '630':'PR','634':'QA','642':'RO','643':'RU','646':'RW','682':'SA','686':'SN',
  '694':'SL','706':'SO','710':'ZA','724':'ES','736':'SD','752':'SE','756':'CH',
  '760':'SY','764':'TH','788':'TN','792':'TR','800':'UG','804':'UA','784':'AE',
  '826':'GB','840':'US','858':'UY','860':'UZ','862':'VE','704':'VN','887':'YE',
  '894':'ZM','716':'ZW','233':'EE','440':'LT','428':'LV','703':'SK','705':'SI',
  '807':'MK','070':'BA','688':'RS','020':'AD','470':'MT','442':'LU'
};

export default function Analytics() {
  const { shortId } = useParams<{ shortId: string }>();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tooltipContent, setTooltipContent] = useState('');
  
  // Phase 3.5: Map Zoom State
  const [position, setPosition] = useState({ coordinates: [0, 0] as [number, number], zoom: 1 });

  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!shortId) return;

      try {
        const response = await analyticsService.getAnalytics(shortId);
        const apiData = response.data.analytics;
        const clicksByDateArray = Object.entries(apiData.clicksByDate).map(
          ([date, clicks]) => ({ date, clicks: Number(clicks) })
        );

        const transformed: AnalyticsData = {
          shortId: response.data.shortId,
          totalClicks: apiData.totalClicks,
          uniqueClicks: apiData.uniqueClicks ?? 0, // Phase 4
          deviceBreakdown: {
            Desktop: apiData.deviceBreakdown.Desktop || 0,
            Mobile: apiData.deviceBreakdown.Mobile || 0,
            Tablet: apiData.deviceBreakdown.Tablet || 0,
            Other: apiData.deviceBreakdown.Other || 0,
          },
          clicksByDate: clicksByDateArray,
          recentClicks: apiData.recentClicks,
          locations: apiData.locations || {},
        };
        setAnalytics(transformed);
      } catch (error: any) {
        const errorMessage =
          error.response?.data?.message ||
          error.response?.data?.error ||
          'Failed to load analytics';
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, [shortId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Phase 3.5: Zoom Handlers
  const handleZoomIn = () => {
    if (position.zoom >= 4) return;
    setPosition((pos) => ({ ...pos, zoom: pos.zoom * 1.5 }));
  };

  const handleZoomOut = () => {
    if (position.zoom <= 1) return;
    setPosition((pos) => ({ ...pos, zoom: pos.zoom / 1.5 }));
  };

  const handleReset = () => {
    setPosition({ coordinates: [0, 0], zoom: 1 });
  };

  const deviceData = analytics
    ? Object.entries(analytics.deviceBreakdown).map(([name, value]) => ({
        name,
        value,
      }))
    : [];

  const maxLocationClicks = analytics
    ? Math.max(1, ...Object.values(analytics.locations))
    : 1;

  const topCountries = analytics
    ? Object.entries(analytics.locations)
        .filter(([code]) => code !== 'Unknown')
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">No analytics data available</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back to Dashboard
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics for {shortId}</h1>
          <p className="text-gray-600">Detailed insights and statistics</p>
        </div>

        {/* ── Summary cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">

          {/* Total Clicks */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Clicks</p>
                <p className="text-3xl font-bold text-gray-900">{analytics.totalClicks}</p>
              </div>
              <MousePointerClick className="w-12 h-12 text-blue-600" />
            </div>
          </div>

          {/* Phase 4: Unique Visitors */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Unique Visitors</p>
                <p className="text-3xl font-bold text-gray-900">{analytics.uniqueClicks}</p>
              </div>
              <Users className="w-12 h-12 text-emerald-500" />
            </div>
          </div>

          {/* Device Breakdown cards */}
          {Object.entries(analytics.deviceBreakdown).map(([device, count]) => {
            const Icon = DEVICE_ICONS[device];
            return (
              <div key={device} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{device}</p>
                    <p className="text-3xl font-bold text-gray-900">{count}</p>
                  </div>
                  <Icon className="w-12 h-12 text-gray-400" />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Charts row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Clicks Over Time</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.clicksByDate}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 12 }}
                />
                <YAxis />
                <Tooltip labelFormatter={formatDate} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  name="Clicks"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Device Breakdown</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={deviceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {deviceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Phase 3: Geographic Heatmap ─────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Geographic Traffic</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Hover over a country to see click counts. Use the controls to zoom and pan.
          </p>

          {/* Map Container */}
          <div className="relative w-full rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
            
            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white/90 backdrop-blur-sm p-1.5 rounded-lg shadow-sm border border-gray-200">
              <button onClick={handleZoomIn} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors" title="Zoom In">
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={handleZoomOut} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors" title="Zoom Out">
                <Minus className="w-4 h-4" />
              </button>
              <button onClick={handleReset} className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors border-t border-gray-100" title="Reset Map">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <ComposableMap
              projectionConfig={{ scale: 147 }}
              style={{ width: '100%', height: 'auto', minHeight: '400px' }}
              data-tooltip-id="geo-tooltip"
            >
              <ZoomableGroup
                zoom={position.zoom}
                center={position.coordinates}
                onMoveEnd={(pos) => setPosition({ coordinates: pos.coordinates as [number, number], zoom: pos.zoom })}
              >
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const numericId: string = geo.id?.toString() ?? '';
                      const alpha2 = NUMERIC_TO_ALPHA2[numericId] ?? null;
                      const clicks = alpha2 ? (analytics.locations[alpha2] ?? 0) : 0;
                      const fill = getCountryColor(clicks, maxLocationClicks);

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={fill}
                          stroke="#fff"
                          strokeWidth={0.4}
                          onMouseEnter={() => {
                            const name = geo.properties.name ?? 'Unknown';
                            setTooltipContent(
                              clicks > 0
                                ? `${name}: ${clicks} click${clicks !== 1 ? 's' : ''}`
                                : name
                            );
                          }}
                          onMouseLeave={() => setTooltipContent('')}
                          style={{
                            default: { outline: 'none' },
                            hover: {
                              fill: '#1d4ed8',
                              outline: 'none',
                              cursor: 'pointer',
                            },
                            pressed: { outline: 'none' },
                          }}
                        />
                      );
                    })
                  }
                </Geographies>
              </ZoomableGroup>
            </ComposableMap>
          </div>

          <ReactTooltip id="geo-tooltip" content={tooltipContent} />

          <div className="flex items-center gap-2 mt-4">
            <span className="text-xs text-gray-400">Fewer</span>
            <div className="flex h-3 flex-1 max-w-48 rounded overflow-hidden">
              {BLUE_SCALE.map((color) => (
                <div key={color} className="flex-1" style={{ backgroundColor: color }} />
              ))}
            </div>
            <span className="text-xs text-gray-400">More</span>
          </div>

          {topCountries.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Top Countries</h3>
              <div className="space-y-2">
                {topCountries.map(([code, count]) => {
                  const pct = Math.round((count / analytics.totalClicks) * 100);
                  return (
                    <div key={code} className="flex items-center gap-3">
                      <span className="w-8 text-xs font-mono font-semibold text-gray-600">
                        {code}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right text-xs text-gray-500">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {analytics.totalClicks === 0 && (
            <p className="text-center text-gray-400 text-sm mt-6 py-4">
              No geographic data yet — clicks will appear here once your link receives traffic.
            </p>
          )}
        </div>

        {/* ── Recent Clicks ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Clicks</h2>
          {analytics.recentClicks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No clicks yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IP Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User Agent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Referrer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analytics.recentClicks.map((click, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {click.ip}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {click.userAgent}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {click.referrer || 'Direct'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTimestamp(click.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}