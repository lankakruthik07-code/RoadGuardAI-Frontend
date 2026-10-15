
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileImage,
  Filter,
  Gauge,
  LayoutDashboard,
  MapPin,
  Menu,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Upload,
  X,
  Zap
} from "lucide-react";
import "./App.css";

const API = "https://roadguardai-backend.onrender.com";
const AI_API = "https://roadguardai-36z5.onrender.com";

function pretty(value) {
  if (value === null || value === undefined || value === "") {
    return "Pending";
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function severityClass(value) {
  const severity = String(value || "").toLowerCase();

  if (severity === "high" || severity === "critical") return "danger";
  if (severity === "medium") return "warning";
  if (severity === "low") return "good";

  return "muted";
}

function dateLabel(value) {
  if (!value) return "Recently reported";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently reported";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isResolved(report) {
  return ["resolved", "closed"].includes(
    String(report.status || "").toLowerCase()
  );
}

export default function App() {
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [location, setLocation] = useState("Hyderabad");

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All reports");
  const [activeNav, setActiveNav] = useState("Overview");
  const [mobileMenu, setMobileMenu] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function loadReports() {
    setLoadingReports(true);
    setReportsError("");

    try {
      const response = await fetch(API);

      if (!response.ok) {
        throw new Error(`Java backend returned HTTP ${response.status}`);
      }

      const data = await response.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      setReportsError(
        err.message || "Could not connect to the Java backend."
      );
    } finally {
      setLoadingReports(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, []);

  async function resolveReport(id) {
    if (resolvingId !== null) return;

    setResolvingId(id);
    setNotice("");
    setError("");

    try {
      const response = await fetch(`${API}/${id}/resolve`, {
        method: "PATCH"
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.message ||
          data.detail ||
          `Could not resolve report (HTTP ${response.status})`
        );
      }

      setNotice(`Report #${id} has been marked as resolved.`);
      await loadReports();
    } catch (err) {
      setError(
        `${err.message || "Failed to resolve report."} Check that the Java backend is running.`
      );
    } finally {
      setResolvingId(null);
    }
  }

  function chooseFile(file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file such as JPG, PNG, or WEBP.");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setAnalysis(null);
    setNotice("");
    setError("");
  }

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(null);
    setPreviewUrl("");
    setAnalysis(null);
    setNotice("");
    setError("");

    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyzeImage() {
    if (!selectedFile) {
      setError("Please select a road image before starting analysis.");
      inputRef.current?.click();
      return;
    }

    if (analyzing) return;

    setAnalyzing(true);
    setAnalysis(null);
    setError("");
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const aiResponse = await fetch(AI_API, {
        method: "POST",
        body: formData
      });

      const aiData = await aiResponse.json().catch(() => ({}));

      if (!aiResponse.ok) {
        throw new Error(
          aiData.detail || `AI service returned HTTP ${aiResponse.status}`
        );
      }

      setAnalysis(aiData);

      const detections = Array.isArray(aiData.detections)
        ? aiData.detections
        : [];

      if (detections.length === 0) {
        setNotice(
          "Analysis complete. No damage was detected. Try another clear road image."
        );
        return;
      }

      const first = detections[0];

      const saveResponse = await fetch(`${API}/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          damageType: first.damageType,
          confidence: first.confidence,
          detectionCount: aiData.count ?? detections.length,
          imageUrl: selectedFile.name,
          location: location.trim() || "Unknown"
        })
      });

      const saved = await saveResponse.json().catch(() => ({}));

      if (!saveResponse.ok) {
        throw new Error(
          saved.message ||
          saved.error ||
          `AI worked, but saving the report failed with HTTP ${saveResponse.status}.`
        );
      }

      setNotice(
        `AI analysis completed. Report #${saved.id ?? "saved"} was saved to the database.`
      );

      await loadReports();
    } catch (err) {
      console.error("RoadGuardAI analysis error:", err);

      setError(
        `${err.message || "Analysis failed."} Check that the Python and Java services are running.`
      );
    } finally {
      setAnalyzing(false);
    }
  }

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reports.filter(report => {
      const matchesSearch =
        !query ||
        [
          report.id,
          report.location,
          report.damageType,
          report.description,
          report.status,
          report.severity
        ].some(value =>
          String(value ?? "").toLowerCase().includes(query)
        );

      const status = String(report.status || "").toLowerCase();
      const severity = String(report.severity || "").toLowerCase();

      const matchesFilter =
        filter === "All reports" ||
        (filter === "Open" && !isResolved(report)) ||
        (filter === "Resolved" && isResolved(report)) ||
        (filter === "High priority" &&
          ["high", "critical"].includes(severity));

      return matchesSearch && matchesFilter;
    });
  }, [reports, search, filter]);

  const damageCount = reports.filter(
    report => report.damageType && report.damageType !== "null"
  ).length;

  const openCount = reports.filter(report => !isResolved(report)).length;

  const highCount = reports.filter(report =>
    ["high", "critical"].includes(
      String(report.severity || "").toLowerCase()
    )
  ).length;

  const resolvedCount = reports.filter(isResolved).length;

  const navItems = [
    { label: "Overview", icon: LayoutDashboard },
    { label: "AI Vision Lab", icon: ScanLine },
    { label: "Road reports", icon: FileImage },
    { label: "Insights", icon: Activity }
  ];

  function goTo(label) {
    setActiveNav(label);
    setMobileMenu(false);

    const target =
      label === "Road reports"
        ? "reports"
        : label === "AI Vision Lab"
        ? "vision-lab"
        : label === "Insights"
        ? "insights"
        : "overview";

    document.getElementById(target)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={25} />
          </div>

          <div>
            <div className="brand-name">
              RoadGuard<span>AI</span>
            </div>
            <div className="brand-sub">ROAD INTELLIGENCE PLATFORM</div>
          </div>

          <button
            className="icon-button sidebar-close"
            onClick={() => setMobileMenu(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="nav-list">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={`nav-item ${activeNav === label ? "active" : ""}`}
              onClick={() => goTo(label)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === "AI Vision Lab" && (
                <span className="nav-live-dot" />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="system-card">
            <div className="system-heading">
              <span className="live-dot" /> SYSTEM STATUS
            </div>

            <div className="system-row">
              <span>Java API</span>
              <span className={reportsError ? "text-danger" : "status-online"}>
                {reportsError ? "Check API" : "Available"}
              </span>
            </div>

            <div className="system-row">
              <span>AI service</span>
              <span className="status-online">Ready to test</span>
            </div>

            <p>Service availability is confirmed when a request succeeds.</p>
          </div>

          <div className="sidebar-footer">
            <div className="avatar">RG</div>
            <div className="user-copy">
              <strong>Road operations</strong>
              <span>Local workspace</span>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button menu-toggle"
            onClick={() => setMobileMenu(value => !value)}
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>

          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>{activeNav}</strong>
          </div>

          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search reports, locations..."
                aria-label="Search reports"
              />
            </div>

            <div className="top-status">
              <span className="live-dot" /> Local workspace
            </div>

            <button
              className="icon-button"
              title="Refresh reports"
              onClick={loadReports}
            >
              <RefreshCw size={17} />
            </button>

            <div className="profile-avatar">RG</div>
          </div>
        </header>

        <div className="page-content">
          <section className="hero-panel" id="overview">
            <div className="hero-grid" />

            <div className="hero-content">
              <div className="eyebrow">
                <span className="eyebrow-line" />
                CIVIC INFRASTRUCTURE INTELLIGENCE
              </div>

              <h1>
                See the road.
                <br />
                <span>Understand the risk.</span>
              </h1>

              <p>
                AI-assisted road damage detection and repair intelligence,
                turning field images into actionable reports.
              </p>

              <div className="hero-actions">
                <button
                  className="primary-button"
                  onClick={() => goTo("AI Vision Lab")}
                >
                  <ScanLine size={17} />
                  Open AI Vision Lab
                </button>

                <button
                  className="secondary-button"
                  onClick={() => goTo("Road reports")}
                >
                  Explore reports <ArrowUpRight size={16} />
                </button>
              </div>
            </div>

            <div className="hero-orb orb-one" />
            <div className="hero-orb orb-two" />

            <div className="hero-readout">
              <div className="readout-label">
                <span className="live-dot" /> VISION ENGINE
              </div>
              <div className="readout-value">
                YOLO <span>·</span> CV
              </div>
              <div className="readout-rule" />
              <div className="readout-foot">Computer vision inference</div>
            </div>

            <div className="hero-coordinate">
              RG / INFRASTRUCTURE MONITORING
            </div>
          </section>

          <section className="metrics-grid" aria-label="Report metrics">
            <Metric
              icon={FileImage}
              label="Total reports"
              value={reports.length}
              foot="Records in database"
              tone="cyan"
            />

            <Metric
              icon={ScanLine}
              label="AI-classified reports"
              value={damageCount}
              foot="Reports with damage labels"
              tone="violet"
            />

            <Metric
              icon={AlertTriangle}
              label="Open reports"
              value={openCount}
              foot="Awaiting closure"
              tone="amber"
            />

            <Metric
              icon={CheckCircle2}
              label="Resolved reports"
              value={resolvedCount}
              foot="Marked resolved or closed"
              tone="green"
            />
          </section>

          <section className="content-grid" id="vision-lab">
            <div className="panel vision-panel">
              <div className="panel-heading">
                <div>
                  <div className="section-kicker">COMPUTER VISION</div>
                  <h2>
                    <span className="heading-icon">
                      <BrainCircuit size={19} />
                    </span>
                    AI Vision Lab
                  </h2>
                  <p>Upload a field image to run road-damage inference.</p>
                </div>

                <div className="engine-pill">
                  <span className="live-dot" /> YOLO ENGINE
                </div>
              </div>

              <div className="vision-workspace">
                <div className="upload-column">
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={event => chooseFile(event.target.files?.[0])}
                  />

                  <button
                    type="button"
                    className={`dropzone ${selectedFile ? "has-file" : ""}`}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                      event.preventDefault();
                      chooseFile(event.dataTransfer.files?.[0]);
                    }}
                  >
                    {previewUrl ? (
                      <img src={previewUrl} alt="Selected road upload" />
                    ) : (
                      <>
                        <span className="upload-symbol">
                          <Upload size={22} />
                        </span>
                        <strong>Drop a road image here</strong>
                        <span>or click to browse files</span>
                        <small>JPG, PNG or WEBP · local image upload</small>
                      </>
                    )}

                    {previewUrl && (
                      <span className="image-change-label">
                        <FileImage size={13} /> Change image
                      </span>
                    )}
                  </button>

                  <label className="field-label" htmlFor="location-input">
                    REPORT LOCATION <span>OPTIONAL</span>
                  </label>

                  <div className="location-input">
                    <MapPin size={16} />
                    <input
                      id="location-input"
                      value={location}
                      onChange={event => setLocation(event.target.value)}
                      placeholder="e.g. Adilabad, Telangana"
                    />
                  </div>

                  <div className="action-row">
                    <button
                      className="primary-button analyze-button"
                      onClick={analyzeImage}
                      disabled={analyzing}
                    >
                      {analyzing ? (
                        <>
                          <span className="spinner" />
                          Analyzing image...
                        </>
                      ) : (
                        <>
                          <Zap size={17} />
                          Analyze with AI
                        </>
                      )}
                    </button>

                    <button
                      className="icon-button clear-button"
                      title="Clear selected image"
                      onClick={clearImage}
                    >
                      <X size={17} />
                    </button>
                  </div>

                  {analyzing && (
                    <div className="progress-track">
                      <span />
                    </div>
                  )}

                  {notice && (
                    <div className="inline-alert success-alert">
                      <CheckCircle2 size={16} />
                      <span>{notice}</span>
                    </div>
                  )}

                  {error && (
                    <div className="inline-alert error-alert">
                      <AlertTriangle size={16} />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                <div className="result-column">
                  <div className="result-topline">
                    <span>ANALYSIS OUTPUT</span>
                    <span
                      className={`result-status ${
                        analyzing
                          ? "processing"
                          : analysis
                          ? "complete"
                          : ""
                      }`}
                    >
                      {analyzing
                        ? "PROCESSING"
                        : analysis
                        ? "COMPLETE"
                        : "AWAITING IMAGE"}
                    </span>
                  </div>

                  <div
                    className={`result-preview ${
                      previewUrl ? "with-image" : ""
                    }`}
                  >
                    {previewUrl ? (
                      <DetectionCanvas
                        imageUrl={previewUrl}
                        detections={analysis?.detections || []}
                      />
                    ) : (
                      <div className="empty-preview">
                        <div className="scan-frame">
                          <ScanLine size={28} />
                        </div>
                        <strong>Detection canvas</strong>
                        <span>Your selected image will appear here.</span>
                      </div>
                    )}

                    {analyzing && <div className="scan-sweep" />}
                  </div>

                  <div className="result-stats">
                    <div>
                      <span>DETECTIONS</span>
                      <strong>
                        {analysis
                          ? analysis.count ?? analysis.detections?.length ?? 0
                          : "—"}
                      </strong>
                    </div>

                    <div>
                      <span>TOP CLASS</span>
                      <strong className="top-class">
                        {analysis?.detections?.[0]
                          ? pretty(analysis.detections[0].damageType)
                          : "Awaiting result"}
                      </strong>
                    </div>

                    <div>
                      <span>CONFIDENCE</span>
                      <strong>
                        {analysis?.detections?.[0]
                          ? `${(
                              Number(analysis.detections[0].confidence) * 100
                            ).toFixed(1)}%`
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  {analysis?.detections?.length > 0 && (
                    <div className="detection-list">
                      {analysis.detections.map((detection, index) => (
                        <div
                          className="detection-item"
                          key={`${detection.damageType}-${index}`}
                        >
                          <span className="detection-index">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span>{pretty(detection.damageType)}</span>
                          <strong>
                            {(Number(detection.confidence) * 100).toFixed(1)}%
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="disclaimer">
                <AlertTriangle size={14} />
                <span>
                  AI detections are decision-support signals. Verify findings
                  in the field before making repair decisions.
                </span>
              </div>
            </div>

            <aside className="side-stack">
              <div className="panel priority-panel" id="insights">
                <div className="panel-heading compact">
                  <div>
                    <div className="section-kicker">OPERATIONS SNAPSHOT</div>
                    <h2>Response overview</h2>
                  </div>
                  <Gauge size={19} className="subtle-icon" />
                </div>

                <div className="priority-number">
                  {String(highCount).padStart(2, "0")}
                  <span>high priority</span>
                </div>

                <p className="muted-copy">
                  Reports marked high or critical in the database.
                </p>

                <div className="priority-bar">
                  <span
                    style={{
                      width: `${
                        reports.length
                          ? Math.min(100, (highCount / reports.length) * 100)
                          : 0
                      }%`
                    }}
                  />
                </div>

                <div className="priority-foot">
                  <span>Priority share</span>
                  <strong>
                    {reports.length
                      ? Math.round((highCount / reports.length) * 100)
                      : 0}
                    %
                  </strong>
                </div>

                <div className="snapshot-divider" />

                <div className="snapshot-row">
                  <span>
                    <Clock3 size={15} /> Data records loaded
                  </span>
                  <strong>{loadingReports ? "Loading..." : reports.length}</strong>
                </div>

                <div className="snapshot-row">
                  <span>
                    <Activity size={15} /> Backend connection
                  </span>
                  <strong className={reportsError ? "text-danger" : "text-green"}>
                    {reportsError ? "Check API" : "Available"}
                  </strong>
                </div>
              </div>

              <div className="field-note">
                <div className="field-note-icon">
                  <ShieldCheck size={21} />
                </div>
                <div className="section-kicker">DESIGNED FOR FIELD TEAMS</div>
                <h3>From road image to actionable record.</h3>
                <p>
                  Keep reports searchable, traceable, and ready for follow-up
                  instead of losing field observations in chat messages.
                </p>
                <div className="note-footer">
                  <span>ROADGUARDAI / FIELD OPS</span>
                  <ArrowUpRight size={15} />
                </div>
              </div>
            </aside>
          </section>

          <section className="panel reports-panel" id="reports">
            <div className="reports-heading">
              <div>
                <div className="section-kicker">REPORT REGISTER</div>
                <h2>
                  Road damage reports{" "}
                  <span className="count-badge">{reports.length}</span>
                </h2>
                <p>Records fetched from your Spring Boot API.</p>
              </div>

              <div className="report-controls">
                <div className="filter-control">
                  <Filter size={15} />
                  <select
                    value={filter}
                    onChange={event => setFilter(event.target.value)}
                    aria-label="Filter reports"
                  >
                    <option>All reports</option>
                    <option>Open</option>
                    <option>Resolved</option>
                    <option>High priority</option>
                  </select>
                  <ChevronDown size={14} />
                </div>

                <button
                  className="secondary-button refresh-button"
                  onClick={loadReports}
                >
                  <RefreshCw size={15} /> Refresh
                </button>
              </div>
            </div>

            {notice && (
              <div className="inline-alert success-alert report-error">
                <CheckCircle2 size={16} />
                <span>{notice}</span>
              </div>
            )}

            {error && (
              <div className="inline-alert error-alert report-error">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {reportsError && (
              <div className="inline-alert error-alert report-error">
                <AlertTriangle size={16} />
                <span>
                  Could not load reports: {reportsError}. Confirm Spring Boot
                  is running on port 8080.
                </span>
              </div>
            )}

            <div className="table-wrap">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>REPORT</th>
                    <th>LOCATION</th>
                    <th>DAMAGE TYPE</th>
                    <th>SEVERITY</th>
                    <th>STATUS</th>
                    <th>CONFIDENCE</th>
                    <th>ACTION</th>
                  </tr>
                </thead>

                <tbody>
                  {loadingReports ? (
                    <tr>
                      <td colSpan="7" className="table-empty">
                        <span className="spinner dark-spinner" />
                        Loading report records...
                      </td>
                    </tr>
                  ) : filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="table-empty">
                        {reports.length
                          ? "No reports match your search or filter."
                          : "No reports found. Analyze an image to create an AI report."}
                      </td>
                    </tr>
                  ) : (
                    filteredReports.slice(0, 12).map(report => (
                      <tr key={report.id}>
                        <td>
                          <div className="report-id">
                            <span className="report-file-icon">
                              <FileImage size={15} />
                            </span>
                            <span>
                              <strong>
                                RG-{String(report.id ?? "—").padStart(4, "0")}
                              </strong>
                              <small>
                                {dateLabel(report.createdAt || report.timestamp)}
                              </small>
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className="table-location">
                            <MapPin size={13} />
                            {report.location || "Location not set"}
                          </span>
                        </td>

                        <td>{pretty(report.damageType)}</td>

                        <td>
                          <span
                            className={`severity-badge ${severityClass(
                              report.severity
                            )}`}
                          >
                            <span />
                            {pretty(report.severity)}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`status-badge ${
                              isResolved(report) ? "status-resolved" : ""
                            }`}
                          >
                            {pretty(report.status)}
                          </span>
                        </td>

                        <td>
                          {report.confidence === null ||
                          report.confidence === undefined
                            ? "—"
                            : `${
                                Number(report.confidence) <= 1
                                  ? (Number(report.confidence) * 100).toFixed(1)
                                  : Number(report.confidence).toFixed(1)
                              }%`}
                        </td>

                        <td>
                          {!isResolved(report) ? (
                            <button
                              type="button"
                              className="resolve-button"
                              disabled={resolvingId !== null}
                              onClick={() => resolveReport(report.id)}
                            >
                              {resolvingId === report.id ? (
                                <>
                                  <span className="spinner" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 size={14} />
                                  Resolve
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="resolved-label">
                              <CheckCircle2 size={14} />
                              Completed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>
                Showing {Math.min(filteredReports.length, 12)} of{" "}
                {filteredReports.length} matching records
              </span>
              <span>
                <span className="live-dot" /> Synced from local API
              </span>
            </div>
          </section>

          <footer className="page-footer">
            <span>
              ROADGUARDAI <span className="footer-dot">/</span> ROAD
              INTELLIGENCE PLATFORM
            </span>
            <span>AI-assisted analysis · Human-verified decisions</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function DetectionCanvas({ imageUrl, detections }) {
  const imageRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    function updateSize() {
      setSize({
        width: image.clientWidth,
        height: image.clientHeight
      });
    }

    if (image.complete) updateSize();

    image.addEventListener("load", updateSize);

    const observer = new ResizeObserver(updateSize);
    observer.observe(image);

    return () => {
      image.removeEventListener("load", updateSize);
      observer.disconnect();
    };
  }, [imageUrl]);

  const image = imageRef.current;
  const naturalWidth = image?.naturalWidth || 1;
  const naturalHeight = image?.naturalHeight || 1;

  const scaleX = size.width / naturalWidth;
  const scaleY = size.height / naturalHeight;

  return (
    <div className="detection-canvas">
      <img
        ref={imageRef}
        src={imageUrl}
        alt="Road image analyzed by AI"
      />

      {detections.map((detection, index) => {
        if (
          !Array.isArray(detection.boundingBox) ||
          detection.boundingBox.length !== 4
        ) {
          return null;
        }

        const [x1, y1, x2, y2] = detection.boundingBox;

        if (![x1, y1, x2, y2].every(Number.isFinite)) {
          return null;
        }

        const left = x1 * scaleX;
        const top = y1 * scaleY;
        const width = (x2 - x1) * scaleX;
        const height = (y2 - y1) * scaleY;

        const confidence = Number(detection.confidence);
        const label = `${pretty(detection.damageType)} · ${
          Number.isFinite(confidence)
            ? `${(confidence * 100).toFixed(1)}%`
            : "N/A"
        }`;

        return (
          <div
            key={`${detection.damageType}-${index}`}
            className="ai-box"
            style={{ left, top, width, height }}
          >
            <span className="ai-box-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Metric({ icon: Icon, label, value, foot, tone }) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <div className="metric-top">
        <span className="metric-icon">
          <Icon size={18} />
        </span>
        <span className="metric-period">LIVE DATA</span>
      </div>

      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-foot">{foot}</div>

      <div className="metric-spark">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
