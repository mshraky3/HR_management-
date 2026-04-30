/**
 * Bus Transportation Page
 * Manage bus transportation data for branches
 * Main managers can view all branches, branch managers only their branch
 */

import { Fragment, useState, useEffect, useRef, useMemo } from "react";
import { busTransportationAPI, branchesAPI, termsAPI } from "../utils/api";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import {
  formatTermDisplay,
  groupTermsByBranchType,
  deduplicateTerms,
} from "../utils/termHelpers.js";
import BranchBadge from "../components/BranchBadge";
import UnifiedDatePicker from "../components/UnifiedDatePicker";
import "./BusTransportation.css";


function PlateDisplay({ value = "" }) {
  const parsePlate = (plateValue) => {
    if (!plateValue)
      return {
        numbers: ["", "", "", ""],
        lettersEn: ["", "", ""],
        lettersAr: ["", "", ""],
      };
    const numbersPart = String(plateValue)
      .replace(/[^0-9]/g, "")
      .slice(0, 4);
    const lettersEnPart = String(plateValue)
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 3);
    const lettersArPart = String(plateValue)
      .replace(/[^\u0600-\u06FF]/g, "")
      .slice(0, 3);
    const numbers = numbersPart
      .split("")
      .concat(Array(4 - numbersPart.length).fill(""));
    const lettersEn = lettersEnPart
      .split("")
      .concat(Array(3 - lettersEnPart.length).fill(""));
    const lettersAr = lettersArPart
      .split("")
      .concat(Array(3 - lettersArPart.length).fill(""));
    return { numbers, lettersEn, lettersAr };
  };

  const { numbers, lettersEn, lettersAr } = parsePlate(value);

  return (
    <div
      className="saudi-plate-input plate-display plate-display-rect"
      aria-label="رقم اللوحة"
    >
      <div className="plate-section">
        <div className="plate-label">الأرقام</div>
        <div className="plate-numbers">
          {numbers.map((num, idx) => (
            <div key={`num-d-${idx}`} className="plate-input-number plate-cell">
              {num || ""}
            </div>
          ))}
        </div>
      </div>

      <div className="plate-letters-row">
        <div className="plate-section plate-letters-en">
          <div className="plate-label">الحروف (EN)</div>
          <div className="plate-letters">
            {lettersEn.map((letter, idx) => (
              <div
                key={`en-d-${idx}`}
                className="plate-input-letter plate-cell"
              >
                {letter || ""}
              </div>
            ))}
          </div>
        </div>

        <div className="plate-section plate-letters-ar">
          <div className="plate-label">الحروف (AR)</div>
          <div className="plate-letters">
            {lettersAr.map((letter, idx) => (
              <div
                key={`ar-d-${idx}`}
                className="plate-input-letter plate-cell"
                style={{
                  direction: "rtl",
                  fontFamily: "'Noto Sans Arabic', Arial, sans-serif",
                }}
              >
                {letter || ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const BusTransportation = () => {
  const { isMainManager, isBranchOperationsManager, user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const pageTopRef = useRef(null);
  const isBranchOpsUser = isBranchOperationsManager();
  const assignedBranchIds = useMemo(
    () =>
      Array.isArray(user?.assigned_branches)
        ? user.assigned_branches.map((id) => parseInt(id, 10)).filter(Number.isFinite)
        : [],
    [user?.assigned_branches],
  );
  const [buses, setBuses] = useState([]);
  const [filteredBuses, setFilteredBuses] = useState([]);
  const [highlightBusId, setHighlightBusId] = useState(null);
  const [branches, setBranches] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBus, setSelectedBus] = useState(null);
  const [showBusForm, setShowBusForm] = useState(false);
  const [showBusFormInline, setShowBusFormInline] = useState(false);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [busFormInitialTab, setBusFormInitialTab] = useState("basic");
  const [editingStudent, setEditingStudent] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [filterMissingInsurance, setFilterMissingInsurance] = useState(false);
  const [filterMissingLease, setFilterMissingLease] = useState(false);

  useEffect(() => {
    loadTerms();
    if (isMainManager() || isBranchOpsUser) {
      loadBranches();
    }
  }, [isMainManager, isBranchOpsUser]);

  useEffect(() => {
    loadBuses();
  }, [selectedTermId, selectedBranchId]);

  useEffect(() => {
    filterBuses();
  }, [
    searchTerm,
    selectedBranchId,
    selectedTermId,
    filterMissingInsurance,
    filterMissingLease,
    buses,
  ]);

  const prefersReducedMotion = (() => {
    try {
      return (
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (e) {
      return false;
    }
  })();

  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const animateScrollToY = (targetY, durationMs = 900) => {
    if (prefersReducedMotion) {
      window.scrollTo(0, targetY);
      return;
    }

    const startY = window.scrollY || window.pageYOffset || 0;
    const maxY = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const clampedTarget = Math.max(0, Math.min(targetY, maxY));
    const delta = clampedTarget - startY;
    if (Math.abs(delta) < 2) return;

    const start = performance.now();
    const step = (now) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeInOutCubic(t);
      window.scrollTo(0, startY + delta * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const animateScrollToElement = (
    el,
    { offset = 12, block = "start", durationMs = 900 } = {},
  ) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const currentY = window.scrollY || window.pageYOffset || 0;
    const elementTop = currentY + rect.top;
    const elementCenter =
      currentY + rect.top + rect.height / 2 - window.innerHeight / 2;
    const targetY = block === "center" ? elementCenter : elementTop - offset;
    animateScrollToY(targetY, durationMs);
  };

  // Scroll down to the form when opening it (edit/complete/add)
  useEffect(() => {
    if (!showBusForm) return;
    const t = setTimeout(() => {
      const formEl = document.querySelector(".bus-form-expanding-section");
      animateScrollToElement(formEl, {
        block: "start",
        offset: 12,
        durationMs: 1100,
      });
    }, 50);
    return () => clearTimeout(t);
  }, [showBusForm, editingBus?.id, busFormInitialTab]);

  const scrollUpToCards = () => {
    // Scroll up to page header/cards area
    const target =
      pageTopRef.current ||
      document.querySelector(".bus-transportation-container");
    animateScrollToElement(target, {
      block: "start",
      offset: 0,
      durationMs: 1000,
    });
  };

  // After finishing the flow, scroll + highlight the bus card
  useEffect(() => {
    if (!highlightBusId) return;
    const el = document.querySelector(`[data-bus-id="${highlightBusId}"]`);
    if (!el) return;
    animateScrollToElement(el, { block: "center", durationMs: 900 });
    el.classList.add("bus-card-highlight");
    const t = setTimeout(() => {
      el.classList.remove("bus-card-highlight");
      setHighlightBusId(null);
    }, 1600);
    return () => clearTimeout(t);
  }, [highlightBusId, filteredBuses]);

  const loadBranches = async () => {
    try {
      const response = await branchesAPI.getAll({ is_active: true });
      if (response.data.success) {
        const visibleBranches = isBranchOpsUser
          ? (response.data.data || []).filter((branch) =>
            assignedBranchIds.includes(parseInt(branch.id, 10)),
          )
          : response.data.data || [];

        const sorted = visibleBranches.sort((a, b) =>
          (a.branch_name || "").localeCompare(b.branch_name || "", "ar"),
        );
        setBranches(sorted);
      }
    } catch (error) {
      // Error loading branches
    }
  };

  const loadTerms = async () => {
    try {
      let response;
      let currentTermResponse = null;
      let branchType = null;

      if (!isMainManager() && !isBranchOpsUser && user?.branch_id) {
        // For branch managers, get active terms for their branch type
        const branchResponse = await branchesAPI.getById(user.branch_id);
        if (
          branchResponse.data.success &&
          branchResponse.data.data?.branch_type
        ) {
          branchType = branchResponse.data.data.branch_type;

          // Get current term first
          try {
            currentTermResponse = await termsAPI.getCurrent(branchType);
          } catch (e) {
            // Failed to get current term
          }

          response = await termsAPI.getAll({
            is_active: true,
            branch_type: branchType,
          });
          if (response.data.success) {
            const activeTerms = deduplicateTerms(response.data.data || []);
            setTerms(activeTerms);

            // Set term filter automatically to current term if available
            if (
              currentTermResponse?.data?.success &&
              currentTermResponse.data.data
            ) {
              const currentTermId = currentTermResponse.data.data.id;
              // Verify the current term is in the list of active terms
              if (activeTerms.some((t) => t.id === currentTermId)) {
                setSelectedTermId(currentTermId);
              }
            }
          } else {
            setTerms([]);
          }
        }
      } else {
        // For main managers, get all active terms but deduplicate and filter by selected branch if available
        response = await termsAPI.getAll({ is_active: true });
        if (response.data.success) {
          let allTerms = deduplicateTerms(response.data.data || []);

          // If a branch is selected, filter terms by that branch's type and get current term
          if (selectedBranchId) {
            const selectedBranch = branches.find(
              (b) => b.id === parseInt(selectedBranchId),
            );
            if (selectedBranch?.branch_type) {
              branchType = selectedBranch.branch_type;
              allTerms = allTerms.filter(
                (term) => term.branch_type === branchType,
              );

              // Get current term for selected branch
              try {
                currentTermResponse = await termsAPI.getCurrent(branchType);
              } catch (e) {
                // Failed to get current term
              }
            }
          }

          setTerms(allTerms);

          // Set term filter automatically
          if (
            currentTermResponse?.data?.success &&
            currentTermResponse.data.data
          ) {
            const currentTermId = currentTermResponse.data.data.id;
            if (allTerms.some((t) => t.id === currentTermId)) {
              setSelectedTermId(currentTermId);
            }
          } else if (!selectedTermId && allTerms.length > 0) {
            // For main managers without a branch selected, try to find current term by date
            const today = new Date().toISOString().split("T")[0];
            const currentTerm = allTerms.find((term) => {
              const start = term.start_date || term.start_date_gregorian;
              const end = term.end_date || term.end_date_gregorian;
              return start && end && start <= today && end >= today;
            });

            if (currentTerm) {
              setSelectedTermId(currentTerm.id);
            }
          }
        }
      }
    } catch (error) {
      showError("فشل تحميل الفصول الدراسية");
    }
  };

  // Reload terms when branch selection changes (for main managers)
  useEffect(() => {
    if ((isMainManager() || isBranchOpsUser) && branches.length > 0) {
      loadTerms();
    }
  }, [selectedBranchId, isMainManager, isBranchOpsUser, branches.length]);

  const loadBuses = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedTermId) {
        params.term_id = selectedTermId;
      }
      if (!isMainManager() && !isBranchOpsUser && user?.branch_id) {
        params.branch_id = user.branch_id;
      } else if (selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const response = await busTransportationAPI.getAll(params);
      if (response.data.success) {
        setBuses(response.data.data || []);
      }
    } catch (error) {
      showError("فشل تحميل بيانات الحافلات");
    } finally {
      setLoading(false);
    }
  };

  const filterBuses = () => {
    let filtered = [...buses];

    // Filter by term (already filtered in API, but double-check)
    if (selectedTermId) {
      filtered = filtered.filter(
        (bus) => bus.term_id === parseInt(selectedTermId),
      );
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (bus) =>
          bus.bus_number?.toLowerCase().includes(term) ||
          bus.driver_full_name?.toLowerCase().includes(term) ||
          bus.primary_plate?.toLowerCase().includes(term) ||
          bus.route_name?.toLowerCase().includes(term) ||
          bus.branch_name?.toLowerCase().includes(term) ||
          bus.term_name?.toLowerCase().includes(term),
      );
    }

    // Filter by missing insurance (for main manager)
    if (filterMissingInsurance && isMainManager()) {
      filtered = filtered.filter(
        (bus) =>
          !bus.insurance_provider ||
          !bus.insurance_policy_number ||
          !bus.insurance_expiry_date_gregorian,
      );
    }

    // Filter by missing lease info (for main manager)
    if (filterMissingLease && isMainManager()) {
      filtered = filtered.filter((bus) => {
        if (bus.ownership_type !== "leased") return false;
        return (
          !bus.lease_company_name ||
          !bus.lease_contact_info ||
          !bus.lease_contract_number ||
          !bus.lease_start_date_gregorian ||
          !bus.lease_end_date_gregorian
        );
      });
    }

    setFilteredBuses(filtered);
  };

  // Calculate statistics for main manager view
  const calculateStats = () => {
    const totalBuses = filteredBuses.length;
    const totalStudents = filteredBuses.reduce(
      (sum, bus) => sum + (parseInt(bus.student_count) || 0),
      0,
    );
    const totalSeats = filteredBuses.reduce(
      (sum, bus) => sum + (parseInt(bus.number_of_seats) || 0),
      0,
    );
    const availableSeats = totalSeats - totalStudents;

    let complete = 0;
    let incomplete = 0;
    let owned = 0;
    let leased = 0;



    filteredBuses.forEach((bus) => {
      const studentCount = parseInt(bus.student_count, 10);
      const missingStudents =
        studentCount === 0 ||
        isNaN(studentCount) ||
        bus.student_count === null ||
        bus.student_count === undefined;
      const missingRegDoc = !bus.registration_document_url;
      const missingDriverDoc = !bus.license_document_url;
      // Lease contract is optional - not required for completion
      const missingDocs = missingRegDoc || missingDriverDoc;

      if (missingDocs || missingStudents) {
        incomplete++;
      } else {
        complete++;
      }

      // Count by ownership type
      const ownership = bus.ownership_type || bus.details?.ownership_type;
      if (ownership === "leased") {
        leased++;
      } else {
        owned++;
      }


    });

    // Group by branch for users who can access multiple branches
    const busesByBranch = {};
    if (isMainManager() || isBranchOpsUser) {
      filteredBuses.forEach((bus) => {
        const branchName = bus.branch_name || "غير محدد";
        if (!busesByBranch[branchName]) {
          busesByBranch[branchName] = 0;
        }
        busesByBranch[branchName]++;
      });
    }



    return {
      totalBuses,
      totalStudents,
      totalSeats,
      availableSeats,
      complete,
      incomplete,
      busesByBranch,
      owned,
      leased,

    };
  };

  const stats = calculateStats();
  const canGroupByBranch = isMainManager() || isBranchOpsUser;
  const canSelectBranchInForms = isMainManager() || isBranchOpsUser;
  const defaultScopedBranchId = user?.branch_id || (assignedBranchIds.length === 1 ? assignedBranchIds[0] : "");
  const orderedFilteredBuses = useMemo(() => {
    if (!canGroupByBranch) {
      return filteredBuses;
    }

    return [...filteredBuses].sort((a, b) => {
      const branchCompare = (a.branch_name || "").localeCompare(
        b.branch_name || "",
        "ar",
      );
      if (branchCompare !== 0) return branchCompare;
      return String(a.primary_plate || a.bus_number || a.id).localeCompare(
        String(b.primary_plate || b.bus_number || b.id),
        "ar",
      );
    });
  }, [filteredBuses, canGroupByBranch]);

  const handleCreateBus = async (busData) => {
    try {
      const response = await busTransportationAPI.create(busData);
      if (response.data.success) {
        showSuccess("تم إنشاء الحافلة بنجاح");
        setShowBusForm(false);
        setEditingBus(null);
        // Load the created bus and open details modal to enter remaining data
        const busResponse = await busTransportationAPI.getById(
          response.data.data.id,
        );
        if (busResponse.data.success) {
          setSelectedBus(busResponse.data.data);
        }
        loadBuses();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل إنشاء الحافلة");
    }
  };

  const handleUpdateBus = async (id, busData) => {
    try {
      const response = await busTransportationAPI.update(id, busData);
      if (response.data.success) {
        showSuccess("تم تحديث الحافلة بنجاح");
        setEditingBus(null);
        loadBuses();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل تحديث الحافلة");
    }
  };

  const handleDeleteBus = async (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الحافلة؟")) return;

    try {
      const response = await busTransportationAPI.delete(id);
      if (response.data.success) {
        showSuccess("تم حذف الحافلة بنجاح");
        loadBuses();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل حذف الحافلة");
    }
  };

  const handleViewBus = async (id) => {
    try {
      const response = await busTransportationAPI.getById(id);
      if (response.data.success) {
        setSelectedBus(response.data.data);
        // Queue scroll after render
        setTimeout(() => {
          const section = document.getElementById("bus-details-section");
          if (section) {
            animateScrollToElement(section, { block: "start", durationMs: 800 });
          }
        }, 100);
      }
    } catch (error) {
      showError("فشل تحميل بيانات الحافلة");
    }
  };

  const handleCloseDetailSection = () => {
    if (!selectedBus) return;

    // Close inline form if open
    setShowBusFormInline(false);

    // Find the bus card we originally clicked
    const busId = selectedBus.id;
    const card = document.querySelector(`[data-bus-id="${busId}"]`);

    // Animate scroll back to it
    if (card) {
      animateScrollToElement(card, { block: "center", durationMs: 800 });
      card.classList.add("bus-card-highlight");
      setTimeout(() => card.classList.remove("bus-card-highlight"), 1600);
    }

    // Short delay to let the user see the motion starting before section potentially disappears 
    // (though React might unmount it instantly, so we just set null. 
    // Ideally we would wait, but unmounting instantly is also fine as we are moving away)
    setSelectedBus(null);
  };

  // Keep the bus form visible even if the list is reloading, so uploads/autosaves never "close" it.
  if (loading && !showBusForm && !selectedBus) {
    return (
      <div className="bus-transportation-container">
        <div className="bus-skeleton-page" aria-label="جاري تحميل بيانات الباصات">
          <div className="bus-skeleton-header" />
          <div className="bus-skeleton-filters" />
          <div className="bus-skeleton-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bus-skeleton-card" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bus-transportation-container">
      <div className="bus-transportation-header" ref={pageTopRef}>
        <div className="header-content">
          <div className="header-icon">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
                fill="currentColor"
              />
              <path
                d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
            </svg>
          </div>
          <div>
            <h1>الباصات</h1>
            <p className="page-description">إدارة بيانات حافلات نقل الطلاب</p>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setEditingBus(null);
            setBusFormInitialTab("basic");
            setShowBusForm(true);
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 5v14m-7-7h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          إضافة حافلة
        </button>
      </div>

      {/* Statistics Cards - Main Manager View */}
      {isMainManager() && (
        <div className="bus-stats-section">
          <div className="stats-cards-grid">
            <div className="stat-card">
              <div
                className="stat-card-icon"
                style={{
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M8 17h8M8 7h8M4 12h16"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <rect
                    x="2"
                    y="3"
                    width="20"
                    height="18"
                    rx="2"
                    stroke="white"
                    strokeWidth="2"
                    fill="none"
                  />
                </svg>
              </div>
              <div className="stat-card-content">
                <div className="stat-card-label">إجمالي الباصات</div>
                <div className="stat-card-value">{stats.totalBuses}</div>
              </div>
            </div>

            <div className="stat-card">
              <div
                className="stat-card-icon"
                style={{
                  background:
                    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="9"
                    cy="7"
                    r="4"
                    stroke="white"
                    strokeWidth="2"
                    fill="none"
                  />
                  <path
                    d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="stat-card-content">
                <div className="stat-card-label">إجمالي الطلاب</div>
                <div className="stat-card-value">
                  {parseInt(stats.totalStudents) || 0}
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div
                className="stat-card-icon"
                style={{
                  background:
                    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <polyline
                    points="22 4 12 14.01 9 11.01"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="stat-card-content">
                <div className="stat-card-label">باصات مكتملة</div>
                <div className="stat-card-value">{stats.complete}</div>
              </div>
            </div>

            <div className="stat-card">
              <div
                className="stat-card-icon"
                style={{
                  background:
                    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 8v4M12 16h.01"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="stat-card-content">
                <div className="stat-card-label">باصات غير مكتملة</div>
                <div className="stat-card-value">{stats.incomplete}</div>
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div className="bus-charts-grid">
            {/* Simple Bar Chart: Buses by Branch */}
            {Object.keys(stats.busesByBranch).length > 0 && (
              <div className="bus-chart-section">
                <h3 className="chart-title">توزيع الباصات حسب الفروع</h3>
                <div className="bus-chart-container">
                  <div className="bus-chart-bars">
                    {Object.entries(stats.busesByBranch)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([branchName, count], idx) => {
                        const maxCount = Math.max(
                          ...Object.values(stats.busesByBranch),
                        );
                        const percentage =
                          maxCount > 0 ? (count / maxCount) * 100 : 0;
                        const colors = [
                          "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                          "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                          "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                          "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
                          "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
                          "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
                          "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
                          "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
                        ];
                        return (
                          <div key={branchName} className="bus-chart-bar-item">
                            <div className="bus-chart-bar-label">
                              {branchName}
                            </div>
                            <div className="bus-chart-bar-wrapper">
                              <div
                                className="bus-chart-bar"
                                style={{
                                  width: `${percentage}%`,
                                  background: colors[idx % colors.length],
                                  minWidth: count > 0 ? "20px" : "0",
                                }}
                              >
                                <span className="bus-chart-bar-value">
                                  {count}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* Ownership Type Chart */}
            {(stats.owned > 0 || stats.leased > 0) && (
              <div className="bus-chart-section">
                <h3 className="chart-title">توزيع الباصات حسب نوع الملكية</h3>
                <div className="bus-chart-container">
                  <div className="ownership-chart">
                    <div className="ownership-chart-item">
                      <div className="ownership-label">ملك الشركة</div>
                      <div className="ownership-bar-wrapper">
                        <div
                          className="ownership-bar"
                          style={{
                            width:
                              stats.totalBuses > 0
                                ? `${(stats.owned / stats.totalBuses) * 100}%`
                                : "0%",
                            background:
                              "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                            minWidth: stats.owned > 0 ? "60px" : "0",
                          }}
                        >
                          <span className="ownership-value">{stats.owned}</span>
                        </div>
                      </div>
                    </div>
                    <div className="ownership-chart-item">
                      <div className="ownership-label">مستأجر</div>
                      <div className="ownership-bar-wrapper">
                        <div
                          className="ownership-bar"
                          style={{
                            width:
                              stats.totalBuses > 0
                                ? `${(stats.leased / stats.totalBuses) * 100}%`
                                : "0%",
                            background:
                              "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
                            minWidth: stats.leased > 0 ? "60px" : "0",
                          }}
                        >
                          <span className="ownership-value">
                            {stats.leased}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Capacity Chart: Seats vs Students */}
            {stats.totalSeats > 0 && (
              <div className="bus-chart-section capacity-chart-full-width">
                <h3 className="chart-title">المقاعد المتاحة مقابل الطلاب</h3>
                <div className="bus-chart-container">
                  <div className="capacity-summary">
                    <div className="capacity-summary-item">
                      <div className="capacity-label">إجمالي المقاعد</div>
                      <div className="capacity-value seats-total">
                        {stats.totalSeats}
                      </div>
                    </div>
                    <div className="capacity-summary-item">
                      <div className="capacity-label">الطلاب المسجلين</div>
                      <div className="capacity-value students-total">
                        {stats.totalStudents}
                      </div>
                    </div>
                    <div className="capacity-summary-item">
                      <div className="capacity-label">المقاعد المتاحة</div>
                      <div
                        className={`capacity-value available-total ${stats.availableSeats < 10 ? "warning" : ""}`}
                      >
                        {stats.availableSeats}
                      </div>
                    </div>
                  </div>

                  {/* Overall capacity bar */}
                  <div className="overall-capacity-bar">
                    <div className="capacity-bar-label">
                      نسبة الاستخدام الإجمالية
                    </div>
                    <div className="capacity-bar-wrapper">
                      <div
                        className="capacity-bar-used"
                        style={{
                          width:
                            stats.totalSeats > 0
                              ? `${(stats.totalStudents / stats.totalSeats) * 100}%`
                              : "0%",
                          background:
                            stats.totalSeats > 0 &&
                              stats.totalStudents / stats.totalSeats >= 0.9
                              ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                              : stats.totalSeats > 0 &&
                                stats.totalStudents / stats.totalSeats >= 0.7
                                ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                                : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        }}
                      >
                        <span className="capacity-bar-text">
                          {stats.totalSeats > 0
                            ? Math.round(
                              (stats.totalStudents / stats.totalSeats) * 100,
                            )
                            : 0}
                          %
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters - Main Manager and Branch Ops */}
      {(isMainManager() || isBranchOpsUser) && (
        <div className="filters-section">
          <div className="filters-header">
            <h3 className="filters-title">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                style={{ marginLeft: "0.5rem" }}
              >
                <path
                  d="M3 6a3 3 0 013-3h2.25a3 3 0 013 3v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V6zM13.5 6a3 3 0 013-3H18.75a3 3 0 013 3v2.25a3 3 0 01-3 3H16.5a3 3 0 01-3-3V6zM3 15.75a3 3 0 013-3h2.25a3 3 0 013 3V18a3 3 0 01-3 3H6a3 3 0 01-3-3v-2.25zM13.5 15.75a3 3 0 013-3H18.75a3 3 0 013 3V18a3 3 0 01-3 3H16.5a3 3 0 01-3-3v-2.25z"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
              الفلاتر
            </h3>
            {(searchTerm ||
              selectedTermId ||
              selectedBranchId ||
              filterMissingInsurance ||
              filterMissingLease) && (
                <button
                  className="clear-filters-btn"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedTermId("");
                    setSelectedBranchId("");
                    setFilterMissingInsurance(false);
                    setFilterMissingLease(false);
                  }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ marginLeft: "0.5rem" }}
                  >
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  إلغاء الفلاتر
                </button>
              )}
          </div>

          <div className="filters-content-wrapper">
            <div className="filters-main-row">
              {/* Search Filter */}
              <div className="filter-group filter-search">
                <label className="filter-label">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ marginLeft: "0.5rem" }}
                  >
                    <path
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                  البحث
                </label>
                <div className="search-box">
                  <svg
                    className="search-icon"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="ابحث عن حافلة، سائق، لوحة، أو مسار..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="filter-input"
                  />
                </div>
              </div>

              {/* Term Filter */}
              <div className="filter-group filter-term">
                <label className="filter-label">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ marginLeft: "0.5rem" }}
                  >
                    <path
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                  الفصل الدراسي
                </label>
                <select
                  className="filter-select"
                  value={selectedTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                >
                  <option value="">جميع الفصول</option>
                  {(() => {
                    // For main managers without branch filter, group by branch type using optgroups
                    if (
                      isMainManager() &&
                      !selectedBranchId &&
                      terms.length > 0
                    ) {
                      const grouped = groupTermsByBranchType(terms);
                      const branchTypeLabels = {
                        school: "مدارس",
                        healthcare_center: "مراكز رعاية نهارية",
                      };

                      return Object.keys(grouped)
                        .map((branchType) => {
                          const typeTerms = grouped[branchType];
                          if (typeTerms.length === 0) return null;

                          return (
                            <optgroup
                              key={branchType}
                              label={branchTypeLabels[branchType] || branchType}
                            >
                              {typeTerms.map((term) => (
                                <option key={term.id} value={term.id}>
                                  {formatTermDisplay(term, {
                                    showBranchType: false,
                                  })}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })
                        .filter(Boolean);
                    } else {
                      // For branch managers or when branch is selected, show flat list
                      return terms.map((term) => (
                        <option key={term.id} value={term.id}>
                          {formatTermDisplay(term, { showBranchType: false })}
                        </option>
                      ));
                    }
                  })()}
                </select>
              </div>

              {/* Branch Filter - Multi-branch users */}
              {(isMainManager() || isBranchOpsUser) && branches.length > 1 && (
                <div className="filter-group filter-branch">
                  <label className="filter-label">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      style={{ marginLeft: "0.5rem" }}
                    >
                      <path
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                    الفرع
                  </label>
                  <select
                    className="filter-select"
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                  >
                    <option value="">جميع الفروع</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.branch_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quick Filter Buttons - Main Manager Only */}
            {isMainManager() && (
              <div className="quick-filters-section">
                <span className="quick-filters-label">فلتر سريع:</span>
                <button
                  className={`quick-filter-btn ${filterMissingInsurance ? "active" : ""}`}
                  onClick={() => {
                    setFilterMissingInsurance(!filterMissingInsurance);
                    setFilterMissingLease(false);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M12 8v4M12 16h.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  ناقص معلومات التأمين
                </button>
                <button
                  className={`quick-filter-btn ${filterMissingLease ? "active" : ""}`}
                  onClick={() => {
                    setFilterMissingLease(!filterMissingLease);
                    setFilterMissingInsurance(false);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M12 8v4M12 16h.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  ناقص معلومات الإيجار
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="section-divider"></div>

      {/* Buses List */}
      <div className="buses-list">
        {orderedFilteredBuses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <p>لا توجد حافلات</p>
          </div>
        ) : (
          <div className="buses-grid">
            {orderedFilteredBuses.map((bus, index) => (
              <Fragment key={bus.id}>
                {canGroupByBranch && (index === 0 || orderedFilteredBuses[index - 1].branch_id !== bus.branch_id) && (
                  <div
                    key={`section-${bus.branch_id}`}
                    style={{
                      gridColumn: '1 / -1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.9rem 1rem',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(16,185,129,0.08))',
                      border: '1px solid rgba(148,163,184,0.2)',
                      marginTop: index === 0 ? 0 : '0.5rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text)' }}>{bus.branch_name || 'غير محدد'}</strong>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        مجموعة مستقلة لهذا الفرع
                      </div>
                    </div>
                    <BranchBadge
                      branch={{
                        id: bus.branch_id,
                        branch_name: bus.branch_name,
                        branch_type: bus.branch_type,
                      }}
                    />
                  </div>
                )}

                <div key={bus.id} className="bus-card" data-bus-id={bus.id}>
                  <div className="bus-card-header">
                    <div className="bus-number">
                      {bus.primary_plate || bus.bus_number || `حافلة #${bus.id}`}
                    </div>
                    {canGroupByBranch && (
                      <div className="branch-badge-wrapper">
                        <BranchBadge
                          branch={{
                            id: bus.branch_id,
                            branch_name: bus.branch_name,
                            branch_type: bus.branch_type,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="bus-card-body">
                    {bus.driver_full_name && (
                      <div className="bus-info-item">
                        <span className="info-label">السائق:</span>
                        <span className="info-value">{bus.driver_full_name}</span>
                      </div>
                    )}
                    {/* Show plate - use primary_plate if available, fallback to bus_number */}
                    {(bus.primary_plate || bus.bus_number) && (
                      <div className="plate-display-wrapper">
                        <span className="info-label">رقم اللوحات</span>
                        <PlateDisplay value={bus.primary_plate || bus.bus_number} />
                      </div>
                    )}
                    {bus.route_name && (
                      <div className="bus-info-item">
                        <span className="info-label">المسار:</span>
                        <span className="info-value">{bus.route_name}</span>
                      </div>
                    )}
                    {bus.number_of_seats && (
                      <div className="bus-info-item">
                        <span className="info-label">عدد المقاعد:</span>
                        <span className="info-value">{bus.number_of_seats}</span>
                      </div>
                    )}
                    {bus.student_count !== undefined && (
                      <div className="bus-info-item">
                        <span className="info-label">عدد الطلاب:</span>
                        <span className="info-value">{bus.student_count}</span>
                      </div>
                    )}
                    {bus.term_name && (
                      <div className="bus-info-item">
                        <span className="info-label">الفصل الدراسي:</span>
                        <span className="info-value">
                          {bus.term_name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="bus-card-actions">
                    <button
                      className="btn-view"
                      onClick={() => handleViewBus(bus.id)}
                    >
                      عرض التفاصيل
                    </button>
                    <button
                      className={`btn-edit ${(() => {
                        const studentCount = parseInt(bus.student_count, 10);
                        const missingStudents =
                          studentCount === 0 ||
                          isNaN(studentCount) ||
                          bus.student_count === null ||
                          bus.student_count === undefined;
                        const missingRegDoc = !bus.registration_document_url;
                        const missingDriverDoc = !bus.license_document_url;
                        // Lease contract is optional - not required for completion
                        const missingDocs =
                          missingRegDoc || missingDriverDoc;
                        return missingDocs || missingStudents
                          ? "incomplete"
                          : "complete";
                      })()}`}
                      onClick={() => {
                        // If the form is already open, force re-mount by changing key (below)
                        // and open the most relevant missing section.
                        const studentCount = parseInt(bus.student_count, 10);
                        const missingStudents =
                          studentCount === 0 ||
                          isNaN(studentCount) ||
                          bus.student_count === null ||
                          bus.student_count === undefined;
                        const missingRegDoc = !bus.registration_document_url;
                        const missingDriverDoc = !bus.license_document_url;
                        // Lease contract is optional - not required for completion
                        const missingDocs =
                          missingRegDoc || missingDriverDoc;

                        setBusFormInitialTab(
                          missingDocs
                            ? "documents"
                            : missingStudents
                              ? "students"
                              : "basic",
                        );
                        setEditingBus(bus);
                        setShowBusForm(true);
                      }}
                    >
                      {(() => {
                        const studentCount = parseInt(bus.student_count, 10);
                        const missingStudents =
                          studentCount === 0 ||
                          isNaN(studentCount) ||
                          bus.student_count === null ||
                          bus.student_count === undefined;
                        const missingRegDoc = !bus.registration_document_url;
                        const missingDriverDoc = !bus.license_document_url;
                        // Lease contract is optional - not required for completion
                        const missingDocs =
                          missingRegDoc || missingDriverDoc;
                        return missingDocs || missingStudents ? "إكمال" : "تعديل";
                      })()}
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteBus(bus.id)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Bus Form Section */}
      {showBusForm && (
        <BusFormModal
          key={editingBus?.id || "new"}
          bus={editingBus}
          branches={branches}
          terms={terms}
          isMainManager={canSelectBranchInForms}
          userBranchId={defaultScopedBranchId}
          initialTab={busFormInitialTab}
          onClose={() => {
            setShowBusForm(false);
            setEditingBus(null);
            setBusFormInitialTab("basic");
            // Scroll back up after closing or final save
            setTimeout(scrollUpToCards, 50);
          }}
          onSave={
            editingBus
              ? (data) => handleUpdateBus(editingBus.id, data)
              : handleCreateBus
          }
          onReload={loadBuses}
          onAfterFinish={(busId) => setHighlightBusId(busId)}
        />
      )}

      {/* Bus Details Section */}
      {selectedBus && (
        <BusDetailsSection
          bus={selectedBus}
          branches={branches}
          terms={terms}
          isMainManager={canSelectBranchInForms}
          userBranchId={defaultScopedBranchId}
          showEditForm={showBusFormInline}
          onClose={handleCloseDetailSection}
          onEdit={() => {
            // Open edit form in the same modern container
            setEditingBus(selectedBus);
            setBusFormInitialTab("basic");
            setShowBusFormInline(true);
          }}
          onReload={loadBuses}
        />
      )}
    </div>
  );
};

// Bus Form Modal Component - Extended with tabs for all data
const BusFormModal = ({
  bus,
  branches,
  terms,
  isMainManager,
  userBranchId,
  initialTab = "basic",
  isInlineEdit = false,
  onClose,
  onSave,
  onReload,
  onAfterFinish,
}) => {
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const isEditing = !!bus;
  const hydratedRef = useRef(false);
  // Avoid repeating auto-saves (improves tab switching speed + prevents form resets)
  const lastAutoSavedRef = useRef({
    basic: null,
    registration: null,
    driver: null,
    details: null,
  });
  const [activeTab, setActiveTab] = useState(initialTab || "basic");
  // Make students the last step in the wizard
  const tabsFlow = [
    "basic",
    "registration",
    "driver",
    "details",
    "documents",
    "students",
  ];
  const [maxStepIndex, setMaxStepIndex] = useState(
    bus ? tabsFlow.length - 1 : 0,
  );
  const [saving, setSaving] = useState(false);
  const [docsState, setDocsState] = useState({
    registration: !!bus?.registration?.registration_document_url,
    driverLicense: !!bus?.driver_license?.license_document_url,
    leaseContract: !!bus?.lease_contract_document_url,
  });
  // Keep uploaded docs in modal state so they remain visible even when switching tabs
  const [uploadedDocs, setUploadedDocs] = useState(() => ({
    registration:
      bus?.registration?.registration_document_url ||
        bus?.registration_document_url
        ? {
          url:
            bus?.registration?.registration_document_url ||
            bus?.registration_document_url,
        }
        : null,
    driverLicense:
      bus?.driver_license?.license_document_url || bus?.license_document_url
        ? {
          url:
            bus?.driver_license?.license_document_url ||
            bus?.license_document_url,
        }
        : null,
    leaseContract: bus?.lease_contract_document_url
      ? { url: bus.lease_contract_document_url }
      : null,
  }));
  const [currentTerm, setCurrentTerm] = useState(null);
  const [loadingTerm, setLoadingTerm] = useState(false);
  const [createdBusId, setCreatedBusId] = useState(bus?.id || null);
  const formSectionRef = useRef(null);
  const termLoadedRef = useRef(false);

  // Basic bus info
  const [basicFormData, setBasicFormData] = useState({
    branch_id: bus?.branch_id || userBranchId || "",
    term_id: bus?.term_id || "",
    plate_number: bus?.bus_number || "",
  });

  // Scroll to form section when opened
  useEffect(() => {
    if (formSectionRef.current && !bus) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        formSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);
    }
  }, [bus]);

  // Registration data
  const [registrationData, setRegistrationData] = useState({
    registration_number: bus?.registration?.registration_number || "",
    chassis_number: bus?.registration?.chassis_number || "",
    vehicle_model: bus?.registration?.vehicle_model || "",
    model_year: bus?.registration?.model_year || "",
    vehicle_color: bus?.registration?.vehicle_color || "",
    expiry_date_hijri: bus?.registration?.expiry_date_hijri || "",
    expiry_date_gregorian: bus?.registration?.expiry_date_gregorian || "",
  });

  // Driver license data
  const [driverLicenseData, setDriverLicenseData] = useState({
    driver_full_name: bus?.driver_license?.driver_full_name || "",
    driver_id_number: bus?.driver_license?.driver_id_number || "",
    license_number: bus?.driver_license?.license_number || "",
    issue_date_hijri: bus?.driver_license?.issue_date_hijri || "",
    issue_date_gregorian: bus?.driver_license?.issue_date_gregorian || "",
    expiry_date_hijri: bus?.driver_license?.expiry_date_hijri || "",
    expiry_date_gregorian: bus?.driver_license?.expiry_date_gregorian || "",
    driver_phone_number: bus?.driver_license?.driver_phone_number || "",
    driver_nationality: bus?.driver_license?.driver_nationality || "",
    driver_date_of_birth_hijri:
      bus?.driver_license?.driver_date_of_birth_hijri || "",
    driver_date_of_birth_gregorian:
      bus?.driver_license?.driver_date_of_birth_gregorian || "",
    has_assistant: bus?.driver_license?.has_assistant || false,
    assistant_full_name: bus?.driver_license?.assistant_full_name || "",
    assistant_phone_number: bus?.driver_license?.assistant_phone_number || "",
  });

  // License plates
  const [licensePlates, setLicensePlates] = useState(
    bus?.license_plates?.map((p) => ({ ...p })) || [
      { plate_number: bus?.bus_number || "", is_primary: true },
    ],
  );

  // Keep the first plate in sync with the bus plate number (bus is identified by plate)
  useEffect(() => {
    const plate = String(basicFormData.plate_number || "").trim();
    if (!plate) return;
    setLicensePlates((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) {
        return [{ plate_number: plate, is_primary: true }];
      }
      const first = prev[0] || {};
      // Only auto-fill if empty to avoid overwriting user edits
      if (first.plate_number && String(first.plate_number).trim() !== "")
        return prev;
      const updated = [...prev];
      updated[0] = { ...first, plate_number: plate, is_primary: true };
      return updated;
    });
  }, [basicFormData.plate_number]);

  // Bus details (must be declared before step completeness checks)
  const normalizeOwnershipType = (v) =>
    v === "rented" ? "leased" : v || "owned";
  const [busDetailsData, setBusDetailsData] = useState({
    route_name: bus?.details?.route_name || "",
    route_description: bus?.details?.route_description || "",
    number_of_seats: bus?.details?.number_of_seats || "",
    ownership_type: normalizeOwnershipType(bus?.details?.ownership_type),
    lease_company_name: bus?.details?.lease_company_name || "",
    lease_contact_info: bus?.details?.lease_contact_info || "",
    lease_contract_number: bus?.details?.lease_contract_number || "",
    lease_start_date_hijri: bus?.details?.lease_start_date_hijri || "",
    lease_start_date_gregorian: bus?.details?.lease_start_date_gregorian || "",
    lease_end_date_hijri: bus?.details?.lease_end_date_hijri || "",
    lease_end_date_gregorian: bus?.details?.lease_end_date_gregorian || "",
    insurance_provider: bus?.details?.insurance_provider || "",
    insurance_policy_number: bus?.details?.insurance_policy_number || "",
    insurance_expiry_date_gregorian:
      bus?.details?.insurance_expiry_date_gregorian || "",
  });

  const isBlank = (v) =>
    v === null || v === undefined || String(v).trim() === "";
  const parsePlate = (value) => {
    const raw = String(value || "");
    const numbers = raw.replace(/[^0-9]/g, "").slice(0, 4);
    const lettersEn = raw
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 3);
    const lettersAr = raw.replace(/[^\u0600-\u06FF]/g, "").slice(0, 3);
    return {
      numbers,
      lettersEn,
      lettersAr,
      normalized: numbers + lettersEn + lettersAr,
    };
  };

  // When editing, always hydrate the modal with the full saved record from API
  // (the bus list row is often missing nested registration/driver/details/students)
  useEffect(() => {
    if (!bus?.id) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    (async () => {
      try {
        const res = await busTransportationAPI.getById(bus.id);
        if (!res?.data?.success) return;
        const full = res.data.data;
        if (!full) return;

        setCreatedBusId(full.id || bus.id);

        setBasicFormData({
          branch_id: full.branch_id || userBranchId || "",
          term_id: full.term_id || "",
          plate_number: full.bus_number || "",
        });

        setRegistrationData({
          registration_number: full.registration?.registration_number || "",
          chassis_number: full.registration?.chassis_number || "",
          vehicle_model: full.registration?.vehicle_model || "",
          model_year: full.registration?.model_year || "",
          vehicle_color: full.registration?.vehicle_color || "",
          expiry_date_hijri: full.registration?.expiry_date_hijri || "",
          expiry_date_gregorian: full.registration?.expiry_date_gregorian || "",
        });

        setDriverLicenseData({
          driver_full_name: full.driver_license?.driver_full_name || "",
          driver_id_number: full.driver_license?.driver_id_number || "",
          license_number: full.driver_license?.license_number || "",
          issue_date_hijri: full.driver_license?.issue_date_hijri || "",
          issue_date_gregorian: full.driver_license?.issue_date_gregorian || "",
          expiry_date_hijri: full.driver_license?.expiry_date_hijri || "",
          expiry_date_gregorian:
            full.driver_license?.expiry_date_gregorian || "",
          driver_phone_number: full.driver_license?.driver_phone_number || "",
          driver_nationality: full.driver_license?.driver_nationality || "",
          driver_date_of_birth_hijri:
            full.driver_license?.driver_date_of_birth_hijri || "",
          driver_date_of_birth_gregorian:
            full.driver_license?.driver_date_of_birth_gregorian || "",
          has_assistant: full.driver_license?.has_assistant || false,
          assistant_full_name: full.driver_license?.assistant_full_name || "",
          assistant_phone_number:
            full.driver_license?.assistant_phone_number || "",
        });

        setLicensePlates(
          full.license_plates?.map((p) => ({ ...p }))?.length
            ? full.license_plates.map((p) => ({ ...p }))
            : [{ plate_number: full.bus_number || "", is_primary: true }],
        );

        setBusDetailsData({
          route_name: full.details?.route_name || "",
          route_description: full.details?.route_description || "",
          number_of_seats: full.details?.number_of_seats || "",
          ownership_type: normalizeOwnershipType(full.details?.ownership_type),
          lease_company_name: full.details?.lease_company_name || "",
          lease_contact_info: full.details?.lease_contact_info || "",
          lease_contract_number: full.details?.lease_contract_number || "",
          lease_start_date_hijri: full.details?.lease_start_date_hijri || "",
          lease_start_date_gregorian:
            full.details?.lease_start_date_gregorian || "",
          lease_end_date_hijri: full.details?.lease_end_date_hijri || "",
          lease_end_date_gregorian:
            full.details?.lease_end_date_gregorian || "",
          insurance_provider: full.details?.insurance_provider || "",
          insurance_policy_number: full.details?.insurance_policy_number || "",
          insurance_expiry_date_gregorian:
            full.details?.insurance_expiry_date_gregorian || "",
        });

        setDocsState({
          registration: !!full.registration?.registration_document_url,
          driverLicense: !!full.driver_license?.license_document_url,
          leaseContract: !!full.lease_contract_document_url,
        });

        setUploadedDocs({
          registration: full.registration?.registration_document_url
            ? {
              url: full.registration.registration_document_url,
              name: full.registration.registration_document_name,
              mime_type: full.registration.registration_document_mime_type,
            }
            : null,
          driverLicense: full.driver_license?.license_document_url
            ? {
              url: full.driver_license.license_document_url,
              name: full.driver_license.license_document_name,
              mime_type: full.driver_license.license_document_mime_type,
            }
            : null,
          leaseContract: full.lease_contract_document_url
            ? {
              url: full.lease_contract_document_url,
              name: full.lease_contract_document_name,
              mime_type: full.lease_contract_document_mime_type,
            }
            : null,
        });

        setStudents(() => {
          const existing = full.students?.map((s) => ({ ...s })) || [];
          if (existing.length === 0) return [makeEmptyStudentRow()];
          return [...existing, makeEmptyStudentRow()];
        });
      } catch (e) {
        // keep initial values if fetch fails
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.id]);

  const getStepComplete = (tabKey) => {
    if (tabKey === "basic") {
      const plateParsed = parsePlate(basicFormData.plate_number);
      const branchOk = !isMainManager || !isBlank(basicFormData.branch_id);
      return (
        branchOk &&
        !isBlank(basicFormData.term_id) &&
        plateParsed.numbers.length === 4 &&
        plateParsed.lettersEn.length === 3 &&
        plateParsed.lettersAr.length === 3
      );
    }
    if (tabKey === "registration") {
      return (
        !isBlank(registrationData.registration_number) &&
        !isBlank(registrationData.chassis_number) &&
        !isBlank(registrationData.vehicle_model) &&
        !isBlank(registrationData.expiry_date_gregorian)
      );
    }
    if (tabKey === "driver") {
      if (driverLicenseData?.has_assistant) {
        return (
          !isBlank(driverLicenseData.driver_full_name) &&
          !isBlank(driverLicenseData.driver_id_number) &&
          !isBlank(driverLicenseData.license_number) &&
          !isBlank(driverLicenseData.expiry_date_gregorian) &&
          !isBlank(driverLicenseData.assistant_full_name) &&
          !isBlank(driverLicenseData.assistant_phone_number)
        );
      }
      return (
        !isBlank(driverLicenseData.driver_full_name) &&
        !isBlank(driverLicenseData.driver_id_number) &&
        !isBlank(driverLicenseData.license_number) &&
        !isBlank(driverLicenseData.expiry_date_gregorian)
      );
    }
    if (tabKey === "details") {
      return (
        !isBlank(busDetailsData.number_of_seats) &&
        !isBlank(busDetailsData.ownership_type)
      );
    }
    if (tabKey === "students") {
      return true;
    }
    if (tabKey === "documents") {
      return true; // uploads are optional
    }
    return true;
  };

  const activeStepIndex = Math.max(0, tabsFlow.indexOf(activeTab));
  const canGoPrev = activeStepIndex > 0;
  const canGoNext =
    activeStepIndex >= 0 && activeStepIndex < tabsFlow.length - 1;
  const currentStepComplete = getStepComplete(activeTab);

  const goPrev = () => {
    if (!canGoPrev) return;
    setActiveTab(tabsFlow[activeStepIndex - 1]);
  };

  const autoSaveTab = async (tabKey) => {
    // Auto-save silently (no manual save needed)
    let busId = createdBusId || bus?.id;

    if (tabKey === "basic") {
      if (isMainManager && isBlank(basicFormData.branch_id)) {
        showError("⚠️ الفرع مطلوب\n\nيرجى اختيار الفرع من القائمة المنسدلة في تبويب 'البيانات الأساسية'.");
        return { ok: false };
      }
      if (isBlank(basicFormData.term_id)) {
        showError("⚠️ الفصل الدراسي مطلوب\n\nيرجى اختيار الفصل الدراسي الذي ستعمل فيه الحافلة.");
        return { ok: false };
      }

      const plateParsed = parsePlate(basicFormData.plate_number);
      if (
        plateParsed.numbers.length !== 4 ||
        plateParsed.lettersEn.length !== 3 ||
        plateParsed.lettersAr.length !== 3
      ) {
        showError("⚠️ رقم اللوحة غير مكتمل\n\nاللوحة يجب أن تحتوي على:\n• 4 أرقام (مثال: 1234)\n• 3 حروف إنجليزية (مثال: ABC)\n• 3 حروف عربية (مثال: أبج)");
        return { ok: false };
      }

      const payload = {
        branch_id: basicFormData.branch_id || userBranchId,
        term_id: basicFormData.term_id,
        bus_number: plateParsed.normalized,
      };
      const signature = JSON.stringify(payload);
      if (busId && lastAutoSavedRef.current.basic === signature) {
        return { ok: true, busId };
      }

      // Create bus once
      if (!busId) {
        const createRes = await busTransportationAPI.create(payload);
        if (!createRes.data?.success) {
          throw new Error(createRes.data?.message || "فشل إنشاء الحافلة");
        }
        busId = createRes.data.data.id;
        setCreatedBusId(busId);
      } else {
        // IMPORTANT: Do NOT call the parent onSave here (it triggers loadBuses() + can unmount the form).
        // Update directly to keep the form stable during autosave.
        await busTransportationAPI.update(busId, payload);
      }

      // Keep one primary plate matching basic (safe)
      try {
        if (bus?.license_plates) {
          for (const plate of bus.license_plates) {
            await busTransportationAPI.deleteLicensePlate(busId, plate.id);
          }
        }
      } catch (e) {
        // ignore
      }
      await busTransportationAPI.addLicensePlate(busId, {
        plate_number: payload.bus_number,
        is_primary: true,
      });

      lastAutoSavedRef.current.basic = signature;
      return { ok: true, busId };
    }

    if (!busId) return { ok: false };

    if (tabKey === "registration") {
      const payload = { ...registrationData, term_id: basicFormData.term_id };
      const signature = JSON.stringify(payload);
      if (lastAutoSavedRef.current.registration !== signature) {
        await busTransportationAPI.saveRegistration(busId, payload);
        lastAutoSavedRef.current.registration = signature;
      }
      return { ok: true, busId };
    }

    if (tabKey === "driver") {
      const payload = { ...driverLicenseData, term_id: basicFormData.term_id };
      const signature = JSON.stringify(payload);
      if (lastAutoSavedRef.current.driver !== signature) {
        await busTransportationAPI.saveDriverLicense(busId, payload);
        lastAutoSavedRef.current.driver = signature;
      }
      return { ok: true, busId };
    }

    if (tabKey === "details") {
      const payload = { ...busDetailsData, term_id: basicFormData.term_id };
      const signature = JSON.stringify(payload);
      if (lastAutoSavedRef.current.details !== signature) {
        await busTransportationAPI.saveDetails(busId, payload);
        lastAutoSavedRef.current.details = signature;
      }
      return { ok: true, busId };
    }

    if (tabKey === "students") {
      await handleSaveStudents();
      return { ok: true, busId };
    }

    return { ok: true, busId };
  };

  const goNext = async () => {
    if (!canGoNext) return;
    if (!currentStepComplete) return;

    // Auto-save current step before moving on (create flow only)
    if (!isEditing) {
      try {
        setSaving(true);
        const res = await autoSaveTab(activeTab);
        if (!res?.ok) return;
      } catch (e) {
        showError(
          e.response?.data?.message || e.message || "حدث خطأ أثناء الحفظ",
        );
        return;
      } finally {
        setSaving(false);
      }
    }

    const nextIndex = activeStepIndex + 1;
    setActiveTab(tabsFlow[nextIndex]);
    setMaxStepIndex((prev) => Math.max(prev, nextIndex));
  };

  const makeEmptyStudentRow = () => ({
    student_full_name: "",
    contact_mobile_number: "",
    address: "",
  });

  // Students (always keep one empty row at the end for fast bulk entry)
  const [students, setStudents] = useState(() => {
    const existing = bus?.students?.map((s) => ({ ...s })) || [];
    if (existing.length === 0) return [makeEmptyStudentRow()];
    return [...existing, makeEmptyStudentRow()];
  });

  // Don't count the always-present blank row
  const studentsCount = students.filter(
    // Notes are optional; count only rows with name + phone
    (s) => !isBlank(s?.student_full_name) && !isBlank(s?.contact_mobile_number),
  ).length;

  useEffect(() => {
    const loadCurrentTerm = async () => {
      // If editing, use the bus's term_id
      if (bus?.term_id) {
        setBasicFormData((prev) => ({ ...prev, term_id: bus.term_id }));
        termLoadedRef.current = true;
        return;
      }

      // Skip if term already loaded for this branch
      if (termLoadedRef.current) {
        // Only reload if branch_id changed and we don't have a term set
        if (
          !basicFormData.term_id &&
          (basicFormData.branch_id || userBranchId)
        ) {
          termLoadedRef.current = false;
        } else {
          return;
        }
      }

      // If creating, get current term for the branch
      const branchId = basicFormData.branch_id || userBranchId;
      if (!branchId) {
        termLoadedRef.current = false;
        return; // Wait for branch selection
      }

      // Guard: Don't reload if term is already correctly set
      if (basicFormData.term_id && currentTerm?.id === basicFormData.term_id) {
        termLoadedRef.current = true;
        return;
      }

      try {
        setLoadingTerm(true);
        const branchResponse = await branchesAPI.getById(branchId);

        if (
          branchResponse.data.success &&
          branchResponse.data.data?.branch_type
        ) {
          const branchType = branchResponse.data.data.branch_type;

          // Get current term using the proper API
          const currentTermResponse = await termsAPI.getCurrent(branchType);

          if (
            currentTermResponse?.data?.success &&
            currentTermResponse.data.data
          ) {
            const term = currentTermResponse.data.data;
            // Validate term matches branch_type
            if (term.branch_type === branchType) {
              setCurrentTerm(term);
              setBasicFormData((prev) => ({ ...prev, term_id: term.id }));
              termLoadedRef.current = true;
            }
          } else {
            // Don't auto-select wrong term - let user manually select if no current term found
            setCurrentTerm(null);
            setBasicFormData((prev) => ({ ...prev, term_id: "" }));
            termLoadedRef.current = true; // Mark as loaded even if no term found
          }
        }
      } catch (error) {
        setCurrentTerm(null);
        setBasicFormData((prev) => ({ ...prev, term_id: "" }));
        termLoadedRef.current = true; // Mark as loaded even on error
      } finally {
        setLoadingTerm(false);
      }
    };

    // Reset ref when branch_id changes to allow reload
    if (basicFormData.branch_id) {
      const prevBranchId = termLoadedRef.current ? null : null; // Track previous branch_id if needed
      if (basicFormData.branch_id !== prevBranchId) {
        termLoadedRef.current = false;
      }
    }

    loadCurrentTerm();
  }, [basicFormData.branch_id, userBranchId, bus]);

  // Legacy per-tab save removed: saving happens only at the final step

  const handleSaveRegistration = async () => {
    if (!createdBusId && !bus?.id) {
      showError("يرجى إنشاء الحافلة أولاً");
      return;
    }
    const busId = createdBusId || bus.id;

    try {
      await busTransportationAPI.saveRegistration(busId, registrationData);
      showSuccess("تم حفظ بيانات التسجيل بنجاح");
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ بيانات التسجيل");
      throw error;
    }
  };

  const handleSaveDriverLicense = async () => {
    if (!createdBusId && !bus?.id) {
      showError("يرجى إنشاء الحافلة أولاً");
      return;
    }
    const busId = createdBusId || bus.id;

    try {
      await busTransportationAPI.saveDriverLicense(busId, driverLicenseData);
      showSuccess("تم حفظ بيانات رخصة السائق بنجاح");
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ بيانات رخصة السائق");
      throw error;
    }
  };

  const handleSavePlates = async () => {
    if (!createdBusId && !bus?.id) {
      showError("يرجى إنشاء الحافلة أولاً");
      return;
    }
    const busId = createdBusId || bus.id;

    try {
      // Delete existing plates if editing
      if (bus?.license_plates) {
        for (const plate of bus.license_plates) {
          try {
            await busTransportationAPI.deleteLicensePlate(busId, plate.id);
          } catch (error) {
            // Ignore if plate doesn't exist
          }
        }
      }

      // Create new plates
      const validPlates = licensePlates.filter((p) => p.plate_number);
      for (const plate of validPlates) {
        await busTransportationAPI.addLicensePlate(busId, plate);
      }
      if (validPlates.length > 0) {
        showSuccess("تم حفظ لوحات الترخيص بنجاح");
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ لوحات الترخيص");
      throw error;
    }
  };

  const handleSaveDetails = async () => {
    if (!createdBusId && !bus?.id) {
      showError("يرجى إنشاء الحافلة أولاً");
      return;
    }
    const busId = createdBusId || bus.id;

    try {
      await busTransportationAPI.saveDetails(busId, busDetailsData);
      showSuccess("تم حفظ تفاصيل الحافلة بنجاح");
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ تفاصيل الحافلة");
      throw error;
    }
  };

  const handleAddStudent = () => {
    setStudents((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      makeEmptyStudentRow(),
    ]);
  };

  const handleUpdateStudent = (index, field, value) => {
    const digitsOnly = (v) => String(v || "").replace(/\D/g, "");
    setStudents((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      const current = list[index] || makeEmptyStudentRow();
      const nextValue =
        field === "contact_mobile_number" ? digitsOnly(value) : value;
      list[index] = { ...current, [field]: nextValue };

      // Auto-add a new empty row when user starts filling the last row
      if (index === list.length - 1) {
        const last = list[index] || {};
        const hasAny =
          !isBlank(last.student_full_name) ||
          !isBlank(last.contact_mobile_number) ||
          !isBlank(last.address);
        if (hasAny) {
          list.push(makeEmptyStudentRow());
        }
      }
      return list;
    });
  };

  const handleRemoveStudent = (index) => {
    setStudents((prev) => {
      const list = Array.isArray(prev)
        ? prev.filter((_, i) => i !== index)
        : [];
      // Ensure at least one empty row remains
      if (list.length === 0) return [makeEmptyStudentRow()];
      return list;
    });
  };

  const handleSaveStudents = async () => {
    if (!createdBusId && !bus?.id) {
      showError("⚠️ لا يمكن حفظ الطلاب\n\nيرجى إنشاء الحافلة أولاً بإكمال البيانات الأساسية والضغط على 'التالي'.");
      return;
    }
    const busId = createdBusId || bus.id;

    try {
      // Always delete existing students from the server first (bus list row may not include nested students)
      try {
        const existingRes = await busTransportationAPI.getStudents(busId);
        const existing = existingRes?.data?.data || [];
        for (const st of existing) {
          if (!st?.id) continue;
          try {
            await busTransportationAPI.deleteStudent(busId, st.id);
          } catch (error) {
            // ignore
          }
        }
      } catch (e) {
        // ignore fetch failures; still try to insert new rows
      }

      // Create new students
      const validStudents = students.filter(
        (s) =>
          !isBlank(s?.student_full_name) && !isBlank(s?.contact_mobile_number),
      );
      for (const student of validStudents) {
        await busTransportationAPI.addStudent(busId, {
          ...student,
          // Notes are optional (stored in the same column for now)
          address: student.address || "",
          term_id: basicFormData.term_id,
        });
      }
      if (validStudents.length > 0) {
        showSuccess("تم حفظ بيانات الطلاب بنجاح");
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ بيانات الطلاب");
      throw error;
    }
  };

  const handleFinalSave = async () => {
    // Strict validation: nothing is saved unless all required fields are filled (students optional)
    // Prevent branch managers from saving buses outside their branch (avoid 403 on final save)
    if (
      !isMainManager &&
      bus?.branch_id &&
      userBranchId &&
      parseInt(bus.branch_id) !== parseInt(userBranchId)
    ) {
      showError("⚠️ ليس لديك صلاحية\n\nلا يمكنك تعديل بيانات حافلة تابعة لفرع آخر.");
      return;
    }
    // 1) Basic (required)
    if (isMainManager && isBlank(basicFormData.branch_id)) {
      showError("⚠️ الفرع مطلوب\n\nيرجى اختيار الفرع من القائمة في تبويب 'البيانات الأساسية'.");
      setActiveTab("basic");
      return;
    }
    if (isBlank(basicFormData.term_id)) {
      showError("⚠️ الفصل الدراسي مطلوب\n\nيرجى اختيار الفصل الدراسي الذي ستعمل فيه الحافلة.");
      setActiveTab("basic");
      return;
    }
    const plateParsed = parsePlate(basicFormData.plate_number);
    if (plateParsed.numbers.length !== 4) {
      showError("⚠️ أرقام اللوحة غير مكتملة\n\nيجب إدخال 4 أرقام للوحة (مثال: 1234)\nالأرقام الحالية: ${plateParsed.numbers || 'لا يوجد'}");
      setActiveTab("basic");
      return;
    }
    if (plateParsed.lettersEn.length !== 3) {
      showError("⚠️ الحروف الإنجليزية غير مكتملة\n\nيجب إدخال 3 حروف إنجليزية للوحة (مثال: ABC)\nالحروف الحالية: ${plateParsed.lettersEn || 'لا يوجد'}");
      setActiveTab("basic");
      return;
    }
    if (plateParsed.lettersAr.length !== 3) {
      showError("⚠️ الحروف العربية غير مكتملة\n\nيجب إدخال 3 حروف عربية للوحة (مثال: أبج)\nالحروف الحالية: ${plateParsed.lettersAr || 'لا يوجد'}");
      setActiveTab("basic");
      return;
    }

    // 2) Registration (required remaining fields)
    if (
      isBlank(registrationData.registration_number) ||
      isBlank(registrationData.chassis_number) ||
      isBlank(registrationData.vehicle_model) ||
      isBlank(registrationData.expiry_date_gregorian)
    ) {
      const missingReg = [];
      if (isBlank(registrationData.registration_number)) missingReg.push('رقم التسجيل');
      if (isBlank(registrationData.chassis_number)) missingReg.push('رقم الهيكل');
      if (isBlank(registrationData.vehicle_model)) missingReg.push('موديل المركبة');
      if (isBlank(registrationData.expiry_date_gregorian)) missingReg.push('تاريخ انتهاء الرخصة');
      showError(`⚠️ بيانات التسجيل غير مكتملة\n\nالحقول الناقصة:\n• ${missingReg.join('\n• ')}\n\nيرجى إكمال هذه البيانات في تبويب 'رخصة السير'.`);
      setActiveTab("registration");
      return;
    }

    // 3) Driver license (required remaining fields)
    if (
      isBlank(driverLicenseData.driver_full_name) ||
      isBlank(driverLicenseData.driver_id_number) ||
      isBlank(driverLicenseData.license_number) ||
      isBlank(driverLicenseData.expiry_date_gregorian)
    ) {
      const missingDriver = [];
      if (isBlank(driverLicenseData.driver_full_name)) missingDriver.push('اسم السائق');
      if (isBlank(driverLicenseData.driver_id_number)) missingDriver.push('رقم هوية السائق');
      if (isBlank(driverLicenseData.license_number)) missingDriver.push('رقم رخصة القيادة');
      if (isBlank(driverLicenseData.expiry_date_gregorian)) missingDriver.push('تاريخ انتهاء الرخصة');
      showError(`⚠️ بيانات السائق غير مكتملة\n\nالحقول الناقصة:\n• ${missingDriver.join('\n• ')}\n\nيرجى إكمال هذه البيانات في تبويب 'رخصة السائق'.`);
      setActiveTab("driver");
      return;
    }

    if (
      driverLicenseData?.has_assistant &&
      (isBlank(driverLicenseData.assistant_full_name) ||
        isBlank(driverLicenseData.assistant_phone_number))
    ) {
      const missingAssistant = [];
      if (isBlank(driverLicenseData.assistant_full_name)) missingAssistant.push('اسم المرافق');
      if (isBlank(driverLicenseData.assistant_phone_number)) missingAssistant.push('رقم جوال المرافق');
      showError(`⚠️ بيانات مرافق السائق غير مكتملة\n\nتم تفعيل خيار 'يوجد مرافق' لكن البيانات ناقصة:\n• ${missingAssistant.join('\n• ')}\n\nيرجى إكمالها أو إلغاء خيار 'يوجد مرافق'.`);
      setActiveTab("driver");
      return;
    }

    // 4) Bus details (required)
    if (
      isBlank(busDetailsData.number_of_seats) ||
      isBlank(busDetailsData.ownership_type)
    ) {
      const missingDetails = [];
      if (isBlank(busDetailsData.number_of_seats)) missingDetails.push('عدد المقاعد');
      if (isBlank(busDetailsData.ownership_type)) missingDetails.push('نوع الملكية');
      showError(`⚠️ تفاصيل الحافلة غير مكتملة\n\nالحقول الناقصة:\n• ${missingDetails.join('\n• ')}\n\nيرجى إكمالها في تبويب 'تفاصيل الحافلة'.`);
      setActiveTab("details");
      return;
    }

    // 5) Students are optional, but if user added any partial rows, block save
    const hasAnyStudentInput = students.some(
      (s) =>
        !isBlank(s.student_full_name) ||
        !isBlank(s.contact_mobile_number) ||
        !isBlank(s.address),
    );
    if (hasAnyStudentInput) {
      const hasInvalidStudent = students.some((s) => {
        const any =
          !isBlank(s.student_full_name) ||
          !isBlank(s.contact_mobile_number) ||
          !isBlank(s.address);
        if (!any) return false;
        return (
          isBlank(s.student_full_name) ||
          isBlank(s.contact_mobile_number) ||
          isBlank(s.address)
        );
      });
      if (hasInvalidStudent) {
        showError("⚠️ بيانات الطلاب غير مكتملة\n\nيوجد طالب/طلاب ببيانات ناقصة.\n\nكل طالب يجب أن يحتوي على:\n• الاسم الكامل\n• رقم الجوال\n• العنوان/الملاحظات\n\nيرجى إكمال البيانات أو حذف الصفوف غير المكتملة.");
        setActiveTab("students");
        return;
      }
    }

    setSaving(true);
    try {
      // Create bus if needed
      let busId = createdBusId || bus?.id;
      const basicPayload = {
        branch_id: basicFormData.branch_id,
        term_id: basicFormData.term_id,
        bus_number: plateParsed.normalized,
      };

      if (!busId) {
        const createResponse = await busTransportationAPI.create(basicPayload);
        if (!createResponse.data.success) {
          throw new Error(createResponse.data.message || "فشل إنشاء الحافلة");
        }
        busId = createResponse.data.data.id;
        setCreatedBusId(busId);
      } else {
        // keep basic updated when editing
        await onSave(basicPayload);
      }

      // Save all sections (strict, no silent ignore)
      await busTransportationAPI.saveRegistration(busId, {
        ...registrationData,
        term_id: basicFormData.term_id,
      });

      await busTransportationAPI.saveDriverLicense(busId, {
        ...driverLicenseData,
        term_id: basicFormData.term_id,
      });

      // Plates: keep one primary plate (from Basic)
      if (bus?.license_plates) {
        for (const plate of bus.license_plates) {
          await busTransportationAPI.deleteLicensePlate(busId, plate.id);
        }
      }
      await busTransportationAPI.addLicensePlate(busId, {
        plate_number: plateParsed.normalized,
        is_primary: true,
      });

      await busTransportationAPI.saveDetails(busId, {
        ...busDetailsData,
        term_id: basicFormData.term_id,
      });

      // Students (optional)
      const validStudents = students.filter(
        (s) =>
          !isBlank(s.student_full_name) &&
          !isBlank(s.contact_mobile_number) &&
          !isBlank(s.address),
      );
      if (bus?.students) {
        for (const student of bus.students) {
          await busTransportationAPI.deleteStudent(busId, student.id);
        }
      }
      for (const student of validStudents) {
        await busTransportationAPI.addStudent(busId, {
          ...student,
          term_id: basicFormData.term_id,
        });
      }

      showSuccess("تم حفظ جميع البيانات بنجاح");
      onClose();
      // IMPORTANT: don't auto-reload (it interrupts multi-file uploads)
    } catch (error) {
      showError(
        error.response?.data?.message ||
        error.message ||
        "حدث خطأ أثناء حفظ البيانات",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCurrentTab = async () => {
    const busId = createdBusId || bus?.id;
    if (!busId) {
      showError("⚠️ لا يوجد حافلة لحفظ البيانات\n\nهذه الحافلة لم يتم إنشاؤها بعد. يرجى:\n• التأكد من إدخال البيانات الأساسية (رقم اللوحة)\n• إذا كنت تضيف حافلة جديدة، استخدم زر 'التالي' بدلاً من 'حفظ'");
      return;
    }

    setSaving(true);
    try {
      if (activeTab === "basic") {
        if (isMainManager && isBlank(basicFormData.branch_id)) {
          showError("⚠️ الفرع مطلوب\n\nيرجى اختيار الفرع من القائمة المنسدلة.");
          return;
        }
        if (isBlank(basicFormData.term_id)) {
          showError("⚠️ الفصل الدراسي مطلوب\n\nلم يتم تحديد الفصل الدراسي. تأكد من اختيار الفرع أولاً.");
          return;
        }
        const plateParsed = parsePlate(basicFormData.plate_number);
        if (
          plateParsed.numbers.length !== 4 ||
          plateParsed.lettersEn.length !== 3 ||
          plateParsed.lettersAr.length !== 3
        ) {
          showError("⚠️ رقم اللوحة غير صحيح\n\nاللوحة يجب أن تحتوي على:\n• 4 أرقام (مثال: 1234)\n• 3 حروف إنجليزية (مثال: ABC)\n• 3 حروف عربية (مثال: أبج)");
          return;
        }

        // Update basic bus record (bus_number + term_id)
        await onSave({
          branch_id: basicFormData.branch_id,
          term_id: basicFormData.term_id,
          bus_number: plateParsed.normalized,
        });

        // Keep one primary plate matching basic
        if (bus?.license_plates) {
          for (const plate of bus.license_plates) {
            await busTransportationAPI.deleteLicensePlate(busId, plate.id);
          }
        }
        await busTransportationAPI.addLicensePlate(busId, {
          plate_number: plateParsed.normalized,
          is_primary: true,
        });

        showSuccess("تم حفظ البيانات الأساسية بنجاح");
        return;
      }

      if (activeTab === "registration") {
        await busTransportationAPI.saveRegistration(busId, {
          ...registrationData,
          term_id: basicFormData.term_id,
        });
        showSuccess("تم حفظ بيانات رخصة السير بنجاح");
        return;
      }

      if (activeTab === "driver") {
        await busTransportationAPI.saveDriverLicense(busId, {
          ...driverLicenseData,
          term_id: basicFormData.term_id,
        });
        showSuccess("تم حفظ بيانات رخصة السائق بنجاح");
        return;
      }

      if (activeTab === "details") {
        await busTransportationAPI.saveDetails(busId, {
          ...busDetailsData,
          term_id: basicFormData.term_id,
        });
        showSuccess("تم حفظ تفاصيل الحافلة بنجاح");
        return;
      }

      if (activeTab === "students") {
        await handleSaveStudents();
        showSuccess("تم حفظ بيانات الطلاب بنجاح");
        return;
      }

      if (activeTab === "documents") {
        showSuccess("يمكنك رفع المرفقات من هنا");
      }
    } catch (error) {
      showError(
        error.response?.data?.message || error.message || "حدث خطأ أثناء الحفظ",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bus-form-expanding-section" ref={formSectionRef}>
      <div className="bus-form-section-header">
        <h2>{isInlineEdit ? `تعديل الحافلة - ${bus?.bus_number}` : (bus ? "تعديل الحافلة" : "إضافة حافلة جديدة")}</h2>
        <button className="section-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="bus-form-section-content">
        <div className="tabs">
          <button
            className={activeTab === "basic" ? "active" : ""}
            onClick={() => setActiveTab("basic")}
            disabled={!bus && 0 > maxStepIndex}
          >
            البيانات الأساسية
          </button>
          <button
            className={activeTab === "registration" ? "active" : ""}
            onClick={() => setActiveTab("registration")}
            disabled={!bus && 1 > maxStepIndex}
          >
            رخصة السير
          </button>
          <button
            className={activeTab === "driver" ? "active" : ""}
            onClick={() => setActiveTab("driver")}
            disabled={!bus && 2 > maxStepIndex}
          >
            رخصة السائق
          </button>
          <button
            className={activeTab === "details" ? "active" : ""}
            onClick={() => setActiveTab("details")}
            disabled={!bus && 3 > maxStepIndex}
          >
            تفاصيل الحافلة
          </button>
          <button
            className={activeTab === "documents" ? "active" : ""}
            onClick={() => setActiveTab("documents")}
            disabled={!bus && 4 > maxStepIndex}
          >
            المرفقات
          </button>
          <button
            className={activeTab === "students" ? "active" : ""}
            onClick={() => setActiveTab("students")}
            disabled={!bus && 5 > maxStepIndex}
          >
            الطلاب ({studentsCount})
          </button>
        </div>

        <div className="tab-content">
          {activeTab === "basic" && (
            <div className="tab-panel">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                }}
                className="bus-form"
              >
                {isMainManager && (
                  <div className="form-group">
                    <label>الفرع *</label>
                    <select
                      value={basicFormData.branch_id}
                      onChange={(e) => {
                        setBasicFormData({
                          ...basicFormData,
                          branch_id: e.target.value,
                          term_id: "",
                        });
                        setCurrentTerm(null);
                      }}
                      required
                    >
                      <option value="">اختر الفرع</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.branch_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label>الفصل الدراسي *</label>
                  {loadingTerm ? (
                    <div>جاري تحميل الفصل الدراسي...</div>
                  ) : currentTerm || bus?.term_id ? (
                    <div
                      className="term-display"
                      style={{
                        padding: "8px",
                        backgroundColor: "#f5f5f5",
                        borderRadius: "4px",
                      }}
                    >
                      {currentTerm
                        ? currentTerm.term_name
                        : bus?.term_name
                          ? bus.term_name
                          : "الفصل الحالي"}
                    </div>
                  ) : (
                    <div
                      className="term-display"
                      style={{ padding: "8px", color: "#999" }}
                    >
                      يرجى اختيار الفرع أولاً
                    </div>
                  )}
                  <input type="hidden" value={basicFormData.term_id} required />
                </div>
                {/* Plate identifies the bus - use the same plate UI style */}
                <div className="plates-list">
                  <div className="plate-form-item">
                    <div className="form-grid">
                      <div className="form-group full-width">
                        <label>رقم اللوحة *</label>
                        <SaudiPlateInput
                          value={basicFormData.plate_number || ""}
                          onChange={(value) =>
                            setBasicFormData({
                              ...basicFormData,
                              plate_number: value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}

          {activeTab === "registration" && (
            <RegistrationFormTab
              formData={registrationData}
              setFormData={setRegistrationData}
              busId={createdBusId || bus?.id}
              saving={saving}
            />
          )}

          {activeTab === "driver" && (
            <DriverLicenseFormTab
              formData={driverLicenseData}
              setFormData={setDriverLicenseData}
              busId={createdBusId || bus?.id}
              saving={saving}
            />
          )}

          {activeTab === "details" && (
            <BusDetailsFormTab
              formData={busDetailsData}
              setFormData={setBusDetailsData}
              saving={saving}
              isMainManager={isMainManager}
            />
          )}

          {activeTab === "documents" && (
            <DocumentsFormTab
              busId={createdBusId || bus?.id}
              isLeased={busDetailsData.ownership_type === "leased"}
              ownershipTypeKnown={!isBlank(busDetailsData.ownership_type)}
              isNewBus={!bus}
              initialDocs={uploadedDocs}
              uploadedDocs={uploadedDocs}
              setUploadedDocs={setUploadedDocs}
              beforeUpload={async (kind) => {
                try {
                  // ensure bus exists for uploads
                  if (!createdBusId && !bus?.id) {
                    const res = await autoSaveTab("basic");
                    if (!res?.ok) return false;
                  }
                  if (kind === "registration") {
                    const res = await autoSaveTab("registration");
                    return !!res?.ok;
                  }
                  if (kind === "driverLicense") {
                    const res = await autoSaveTab("driver");
                    return !!res?.ok;
                  }
                  if (kind === "leaseContract") {
                    const res = await autoSaveTab("details");
                    return !!res?.ok;
                  }
                  return true;
                } catch (e) {
                  showError(
                    e.response?.data?.message || e.message || "حدث خطأ",
                  );
                  return false;
                }
              }}
              onDocsChange={(next) => setDocsState(next)}
              onNavigateToStudents={() => setActiveTab("students")}
              onReload={onReload}
            />
          )}

          {activeTab === "students" && (
            <StudentsFormTab
              students={students}
              onUpdate={handleUpdateStudent}
              onRemove={handleRemoveStudent}
            />
          )}
        </div>

        <div className="section-actions">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSaveCurrentTab}
                className="btn-primary"
                disabled={saving}
              >
                {saving ? "جاري الحفظ..." : "حفظ"}
              </button>
            </>
          ) : activeStepIndex !== tabsFlow.length - 1 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={!canGoPrev}
                className="btn-wizard-prev"
              >
                السابق
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={saving || !currentStepComplete || !canGoNext}
                className={`btn-wizard-next ${currentStepComplete ? "enabled" : ""}`}
              >
                التالي
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={goPrev}
                disabled={!canGoPrev}
                className="btn-wizard-prev"
              >
                السابق
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={saving}
                onClick={async () => {
                  try {
                    setSaving(true);
                    // Save students if any valid rows; notes are optional
                    await handleSaveStudents();
                    showSuccess("تم حفظ البيانات بنجاح");
                    if (typeof onReload === "function") onReload();
                    const id = createdBusId || bus?.id;
                    onClose();
                    if (typeof onAfterFinish === "function" && id)
                      onAfterFinish(id);
                  } catch (e) {
                    showError(
                      e.response?.data?.message ||
                      e.message ||
                      "حدث خطأ أثناء الحفظ",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                حفظ
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={saving}
                onClick={() => {
                  // Finish now without requiring students (can complete later)
                  showSuccess("تم حفظ البيانات ويمكنك إكمال الطلاب لاحقًا");
                  if (typeof onReload === "function") onReload();
                  const id = createdBusId || bus?.id;
                  onClose();
                  if (typeof onAfterFinish === "function" && id)
                    onAfterFinish(id);
                }}
              >
                حفظ بدون طلاب
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Form Tab Components for BusFormModal
const RegistrationFormTab = ({ formData, setFormData, busId }) => {
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess } = useNotification();

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !busId) return;

    try {
      setUploading(true);
      const response = await busTransportationAPI.uploadRegistrationDocument(
        busId,
        file,
      );
      if (response.data.success) {
        showSuccess("تم رفع المستند بنجاح");
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل رفع المستند");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>بيانات تسجيل الحافلة</h3>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>رقم التسلسل *</label>
          <input
            type="text"
            value={formData.registration_number}
            onChange={(e) =>
              setFormData({ ...formData, registration_number: e.target.value })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الشاصي *</label>
          <input
            type="text"
            value={formData.chassis_number}
            onChange={(e) =>
              setFormData({ ...formData, chassis_number: e.target.value })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>الموديل *</label>
          <input
            type="text"
            value={formData.vehicle_model}
            onChange={(e) =>
              setFormData({ ...formData, vehicle_model: e.target.value })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>سنة الصنع</label>
          <input
            type="number"
            value={formData.model_year || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                model_year: e.target.value ? parseInt(e.target.value) : null,
              })
            }
          />
        </div>
        <div className="form-group">
          <label>اللون</label>
          <input
            type="text"
            value={formData.vehicle_color}
            onChange={(e) =>
              setFormData({ ...formData, vehicle_color: e.target.value })
            }
          />
        </div>
        <UnifiedDatePicker
          label="تاريخ الانتهاء"
          hijriValue={formData.expiry_date_hijri || ""}
          gregorianValue={formData.expiry_date_gregorian || ""}
          onChange={(hijri, gregorian) =>
            setFormData({
              ...formData,
              expiry_date_hijri: hijri || null,
              expiry_date_gregorian: gregorian || null,
            })
          }
          required
          dateType="general"
          defaultCalendarType="gregorian"
        />
      </div>
    </div>
  );
};

const DocumentsFormTab = ({
  busId,
  isLeased,
  ownershipTypeKnown,
  initialDocs,
  uploadedDocs,
  setUploadedDocs,
  beforeUpload,
  onDocsChange,
  onReload,
  onNavigateToStudents,
  isNewBus,
}) => {
  const { showError, showSuccess } = useNotification();
  const [preSaving, setPreSaving] = useState(false);
  const [uploadingReg, setUploadingReg] = useState(false);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingLease, setUploadingLease] = useState(false);

  // If we opened edit mode with partial data then hydrated later, merge in initial docs once
  useEffect(() => {
    if (typeof setUploadedDocs !== "function") return;
    setUploadedDocs((prev) => ({
      registration: prev?.registration || initialDocs?.registration || null,
      driverLicense: prev?.driverLicense || initialDocs?.driverLicense || null,
      leaseContract: prev?.leaseContract || initialDocs?.leaseContract || null,
    }));
  }, [
    initialDocs?.registration?.url,
    initialDocs?.driverLicense?.url,
    initialDocs?.leaseContract?.url,
  ]);

  const uploadFile = async (kind, file) => {
    if (!file || !busId) return;

    try {
      if (kind === "registration") setUploadingReg(true);
      if (kind === "driverLicense") setUploadingLicense(true);
      if (kind === "leaseContract") setUploadingLease(true);

      // silently save the related form section before uploading
      if (typeof beforeUpload === "function") {
        setPreSaving(true);
        const ok = await beforeUpload(kind);
        setPreSaving(false);
        if (!ok) return;
      }

      const response =
        kind === "registration"
          ? await busTransportationAPI.uploadRegistrationDocument(busId, file)
          : kind === "driverLicense"
            ? await busTransportationAPI.uploadDriverLicenseDocument(
              busId,
              file,
            )
            : await busTransportationAPI.uploadLeaseContractDocument(
              busId,
              file,
            );

      if (response.data?.success) {
        if (typeof setUploadedDocs === "function") {
          setUploadedDocs((prev) => {
            const next = {
              ...prev,
              [kind]: response.data?.data || { name: file.name },
            };
            if (typeof onDocsChange === "function") {
              onDocsChange({
                registration: !!next.registration?.url,
                driverLicense: !!next.driverLicense?.url,
                leaseContract: !!next.leaseContract?.url,
              });
            }

            // Documents are saved immediately on upload - no auto-navigation
            // User must click "Next" button or manually switch tabs to proceed to students table

            return next;
          });
        }
        const label =
          kind === "registration"
            ? "تم رفع مستند رخصة السير بنجاح"
            : kind === "driverLicense"
              ? "تم رفع مستند رخصة السائق بنجاح"
              : "تم رفع عقد الإيجار بنجاح";
        showSuccess(label);
        // REMOVED: onReload() call to prevent modal closure during multi-file uploads
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل رفع الملف");
    } finally {
      if (kind === "registration") setUploadingReg(false);
      if (kind === "driverLicense") setUploadingLicense(false);
      if (kind === "leaseContract") setUploadingLease(false);
      setPreSaving(false);
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>المرفقات</h3>
      </div>

      <div className="form-grid">
        <div className="form-group full-width">
          <label>مستند رخصة السير</label>
          <div
            className="students-table-hint"
            style={{
              color: uploadedDocs?.registration?.url ? "#16a34a" : "#dc2626",
              fontWeight: uploadedDocs?.registration?.url ? "600" : "normal",
            }}
          >
            {preSaving
              ? "جاري حفظ البيانات تلقائياً قبل الرفع..."
              : uploadingReg
                ? "جاري الرفع..."
                : uploadedDocs?.registration?.url
                  ? "✓ تم الحفظ"
                  : "✗ لم يتم الرفع بعد"}
          </div>
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={
              !busId ||
              preSaving ||
              uploadingReg ||
              uploadingLicense ||
              uploadingLease
            }
            onChange={(e) => {
              const file = e.target.files?.[0];
              uploadFile("registration", file);
              e.target.value = "";
            }}
          />
          {!!uploadedDocs?.registration?.url && (
            <div
              style={{
                marginTop: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#0f172a" }}>
                الملف المرفوع: {uploadedDocs.registration?.name || "ملف"}
              </div>
              <a
                href={uploadedDocs.registration.url}
                target="_blank"
                rel="noreferrer"
              >
                فتح الملف
              </a>
            </div>
          )}
        </div>

        <div className="form-group full-width">
          <label>مستند رخصة السائق</label>
          <div
            className="students-table-hint"
            style={{
              color: uploadedDocs?.driverLicense?.url ? "#16a34a" : "#dc2626",
              fontWeight: uploadedDocs?.driverLicense?.url ? "600" : "normal",
            }}
          >
            {preSaving
              ? "جاري حفظ البيانات تلقائياً قبل الرفع..."
              : uploadingLicense
                ? "جاري الرفع..."
                : uploadedDocs?.driverLicense?.url
                  ? "✓ تم الحفظ"
                  : "✗ لم يتم الرفع بعد"}
          </div>
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={
              !busId ||
              preSaving ||
              uploadingReg ||
              uploadingLicense ||
              uploadingLease
            }
            onChange={(e) => {
              const file = e.target.files?.[0];
              uploadFile("driverLicense", file);
              e.target.value = "";
            }}
          />
          {!!uploadedDocs?.driverLicense?.url && (
            <div
              style={{
                marginTop: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#0f172a" }}>
                الملف المرفوع: {uploadedDocs.driverLicense?.name || "ملف"}
              </div>
              <a
                href={uploadedDocs.driverLicense.url}
                target="_blank"
                rel="noreferrer"
              >
                فتح الملف
              </a>
            </div>
          )}
        </div>

        {isLeased && (
          <div className="form-group full-width">
            <label>عقد الإيجار</label>
            <div
              className="students-table-hint"
              style={{
                color: uploadedDocs?.leaseContract?.url ? "#16a34a" : "#dc2626",
                fontWeight: uploadedDocs?.leaseContract?.url ? "600" : "normal",
              }}
            >
              {preSaving
                ? "جاري حفظ البيانات تلقائياً قبل الرفع..."
                : uploadingLease
                  ? "جاري الرفع..."
                  : uploadedDocs?.leaseContract?.url
                    ? "✓ تم الحفظ"
                    : "✗ لم يتم الرفع بعد"}
            </div>
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={
                !busId ||
                preSaving ||
                uploadingReg ||
                uploadingLicense ||
                uploadingLease
              }
              onChange={(e) => {
                const file = e.target.files?.[0];
                uploadFile("leaseContract", file);
                e.target.value = "";
              }}
            />
            {!!uploadedDocs?.leaseContract?.url && (
              <div
                style={{
                  marginTop: "8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ fontSize: "13px", color: "#0f172a" }}>
                  الملف المرفوع: {uploadedDocs.leaseContract?.name || "ملف"}
                </div>
                <a
                  href={uploadedDocs.leaseContract.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  فتح الملف
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const DriverLicenseFormTab = ({ formData, setFormData, busId }) => {
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess } = useNotification();
  const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !busId) return;

    try {
      setUploading(true);
      const response = await busTransportationAPI.uploadDriverLicenseDocument(
        busId,
        file,
      );
      if (response.data.success) {
        showSuccess("تم رفع المستند بنجاح");
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل رفع المستند");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>بيانات رخصة السائق</h3>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>اسم السائق الكامل *</label>
          <input
            type="text"
            value={formData.driver_full_name}
            onChange={(e) =>
              setFormData({ ...formData, driver_full_name: e.target.value })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>رقم هوية السائق *</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.driver_id_number}
            onChange={(e) =>
              setFormData({
                ...formData,
                driver_id_number: digitsOnly(e.target.value),
              })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الرخصة *</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.license_number}
            onChange={(e) =>
              setFormData({
                ...formData,
                license_number: digitsOnly(e.target.value),
              })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>رقم هاتف السائق</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.driver_phone_number}
            onChange={(e) =>
              setFormData({
                ...formData,
                driver_phone_number: digitsOnly(e.target.value),
              })
            }
          />
        </div>
        <div className="form-group">
          <label>جنسية السائق</label>
          <input
            type="text"
            value={formData.driver_nationality}
            onChange={(e) =>
              setFormData({ ...formData, driver_nationality: e.target.value })
            }
          />
        </div>
        <UnifiedDatePicker
          label="تاريخ الميلاد"
          hijriValue={formData.driver_date_of_birth_hijri || ""}
          gregorianValue={formData.driver_date_of_birth_gregorian || ""}
          onChange={(hijri, gregorian) =>
            setFormData({
              ...formData,
              driver_date_of_birth_hijri: hijri || null,
              driver_date_of_birth_gregorian: gregorian || null,
            })
          }
          dateType="birth_date"
          defaultCalendarType="gregorian"
        />
        <UnifiedDatePicker
          label="تاريخ الإصدار"
          hijriValue={formData.issue_date_hijri || ""}
          gregorianValue={formData.issue_date_gregorian || ""}
          onChange={(hijri, gregorian) => {
            setFormData({
              ...formData,
              issue_date_hijri: hijri || null,
              issue_date_gregorian: gregorian || null,
            });
          }}
          dateType="general"
          defaultCalendarType="gregorian"
        />
        <UnifiedDatePicker
          label="تاريخ الانتهاء"
          hijriValue={formData.expiry_date_hijri || ""}
          gregorianValue={formData.expiry_date_gregorian || ""}
          onChange={(hijri, gregorian) => {
            setFormData({
              ...formData,
              expiry_date_hijri: hijri || null,
              expiry_date_gregorian: gregorian || null,
            });
          }}
          required
          dateType="general"
          defaultCalendarType="gregorian"
        />
        <div className="form-group full-width assistant-section">
          <div className="assistant-toggle-row">
            <span className="assistant-toggle-label">
              هل يوجد مرافق للسائق؟
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!formData.has_assistant}
                onChange={(e) => {
                  const has = e.target.checked;
                  setFormData({
                    ...formData,
                    has_assistant: has,
                    assistant_full_name: has
                      ? formData.assistant_full_name || ""
                      : "",
                    assistant_phone_number: has
                      ? formData.assistant_phone_number || ""
                      : "",
                  });
                }}
              />
              <span className="slider"></span>
            </label>
          </div>

          {formData.has_assistant && (
            <div className="assistant-fields">
              <div className="assistant-fields-grid">
                <div className="form-group">
                  <label>اسم مرافق السائق *</label>
                  <input
                    type="text"
                    value={formData.assistant_full_name || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        assistant_full_name: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>رقم جوال مرافق السائق *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    dir="ltr"
                    value={formData.assistant_phone_number || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        assistant_phone_number: digitsOnly(e.target.value),
                      })
                    }
                    required
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Saudi License Plate Input Component
const SaudiPlateInput = ({ value = "", onChange }) => {
  // Parse existing value: "7529HBAأبج" -> numbers: "7529", en: ["H","B","A"], ar: ["أ","ب","ج"]
  const parsePlate = (plateValue) => {
    if (!plateValue)
      return {
        numbers: ["", "", "", ""],
        lettersEn: ["", "", ""],
        lettersAr: ["", "", ""],
      };
    const numbersPart = plateValue.replace(/[^0-9]/g, "").slice(0, 4);
    const lettersEnPart = plateValue
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 3);
    const lettersArPart = plateValue
      .replace(/[^\u0600-\u06FF]/g, "")
      .slice(0, 3);
    const numbers = numbersPart
      .split("")
      .concat(Array(4 - numbersPart.length).fill(""));
    const lettersEn = lettersEnPart
      .split("")
      .concat(Array(3 - lettersEnPart.length).fill(""));
    const lettersAr = lettersArPart
      .split("")
      .concat(Array(3 - lettersArPart.length).fill(""));
    return { numbers, lettersEn, lettersAr };
  };

  const initialParsed = parsePlate(value);
  const [numbers, setNumbers] = useState(initialParsed.numbers);
  const [lettersEn, setLettersEn] = useState(initialParsed.lettersEn);
  const [lettersAr, setLettersAr] = useState(initialParsed.lettersAr);
  const [lastValue, setLastValue] = useState(value);
  const numberRefs = useRef([]);
  const enRefs = useRef([]);
  const arRefs = useRef([]);

  // Update local state when value prop changes (external update)
  useEffect(() => {
    if (value !== lastValue) {
      const parsed = parsePlate(value);
      setNumbers(parsed.numbers);
      setLettersEn(parsed.lettersEn);
      setLettersAr(parsed.lettersAr);
      setLastValue(value);
    }
  }, [value, lastValue]);

  const handleNumberChange = (index, newValue) => {
    if (newValue === "" || /^[0-9]$/.test(newValue)) {
      const updated = [...numbers];
      updated[index] = newValue;
      setNumbers(updated);
      const plateNumber =
        updated.join("") + lettersEn.join("") + lettersAr.join("");
      setLastValue(plateNumber);
      onChange(plateNumber);

      // Auto move to next input
      if (newValue !== "") {
        if (index < updated.length - 1) {
          numberRefs.current[index + 1]?.focus();
        } else {
          enRefs.current[0]?.focus();
        }
      }
    }
  };

  const handleEnglishLetterChange = (index, newValue) => {
    if (newValue === "" || /^[A-Za-z]$/.test(newValue)) {
      const updated = [...lettersEn];
      updated[index] = newValue.toUpperCase();
      setLettersEn(updated);
      const plateNumber =
        numbers.join("") + updated.join("") + lettersAr.join("");
      setLastValue(plateNumber);
      onChange(plateNumber);

      // Auto move to next input
      if (newValue !== "") {
        if (index < updated.length - 1) {
          enRefs.current[index + 1]?.focus();
        } else {
          arRefs.current[0]?.focus();
        }
      }
    }
  };

  const handleArabicLetterChange = (index, newValue) => {
    if (newValue === "" || /^[\u0600-\u06FF]$/.test(newValue)) {
      const updated = [...lettersAr];
      updated[index] = newValue;
      setLettersAr(updated);
      const plateNumber =
        numbers.join("") + lettersEn.join("") + updated.join("");
      setLastValue(plateNumber);
      onChange(plateNumber);

      // Auto move to next input
      if (newValue !== "" && index < updated.length - 1) {
        arRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleBackspaceNav = (e, group, index) => {
    if (e.key !== "Backspace") return;
    if (e.currentTarget.value !== "") return;

    if (group === "numbers") {
      if (index > 0) numberRefs.current[index - 1]?.focus();
      return;
    }
    if (group === "en") {
      if (index > 0) enRefs.current[index - 1]?.focus();
      else numberRefs.current[numbers.length - 1]?.focus();
      return;
    }
    if (group === "ar") {
      if (index > 0) arRefs.current[index - 1]?.focus();
      else enRefs.current[lettersEn.length - 1]?.focus();
    }
  };

  return (
    <div className="saudi-plate-input">
      <div className="plate-section">
        <div className="plate-label">الأرقام</div>
        <div className="plate-numbers">
          {numbers.map((num, idx) => (
            <input
              key={`num-${idx}`}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={num}
              onChange={(e) => handleNumberChange(idx, e.target.value)}
              onKeyDown={(e) => handleBackspaceNav(e, "numbers", idx)}
              ref={(el) => {
                numberRefs.current[idx] = el;
              }}
              className="plate-input-number"
              placeholder="0"
            />
          ))}
        </div>
      </div>
      <div className="plate-section">
        <div className="plate-label">الحروف (EN)</div>
        <div className="plate-letters">
          {lettersEn.map((letter, idx) => (
            <input
              key={`letter-${idx}`}
              type="text"
              maxLength={1}
              value={letter}
              onChange={(e) => handleEnglishLetterChange(idx, e.target.value)}
              onKeyDown={(e) => handleBackspaceNav(e, "en", idx)}
              ref={(el) => {
                enRefs.current[idx] = el;
              }}
              className="plate-input-letter"
              placeholder="A"
            />
          ))}
        </div>
      </div>
      <div className="plate-section">
        <div className="plate-label">الحروف (AR)</div>
        <div className="plate-letters">
          {lettersAr.map((letter, idx) => (
            <input
              key={`letter-ar-${idx}`}
              type="text"
              maxLength={1}
              value={letter}
              onChange={(e) => handleArabicLetterChange(idx, e.target.value)}
              onKeyDown={(e) => handleBackspaceNav(e, "ar", idx)}
              ref={(el) => {
                arRefs.current[idx] = el;
              }}
              className="plate-input-letter"
              placeholder="أ"
              style={{
                direction: "rtl",
                fontFamily: "'Noto Sans Arabic', Arial, sans-serif",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const LicensePlatesFormTab = ({ plates, setPlates }) => {
  // Keep exactly one plate in the UI
  useEffect(() => {
    if (!Array.isArray(plates) || plates.length === 0) {
      setPlates([{ plate_number: "", is_primary: true }]);
    } else if (plates.length > 1) {
      setPlates([{ ...plates[0], is_primary: true }]);
    } else {
      // enforce primary
      setPlates([{ ...plates[0], is_primary: true }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePlate = (value) => {
    setPlates([
      { ...(plates?.[0] || {}), plate_number: value, is_primary: true },
    ]);
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>لوحات الترخيص</h3>
      </div>

      <div className="plates-list">
        <div className="plate-form-item">
          <div className="form-grid">
            <div className="form-group full-width">
              <label>رقم اللوحة *</label>
              <SaudiPlateInput
                value={plates?.[0]?.plate_number || ""}
                onChange={(value) => updatePlate(value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BusDetailsFormTab = ({ formData, setFormData, isMainManager }) => {
  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>تفاصيل الحافلة</h3>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>خط السير</label>
          <input
            type="text"
            value={formData.route_name}
            onChange={(e) =>
              setFormData({ ...formData, route_name: e.target.value })
            }
          />
        </div>
        <div className="form-group">
          <label>عدد المقاعد *</label>
          <input
            type="number"
            value={formData.number_of_seats}
            onChange={(e) =>
              setFormData({
                ...formData,
                number_of_seats: parseInt(e.target.value) || "",
              })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>نوع الملكية *</label>
          <select
            value={formData.ownership_type}
            onChange={(e) =>
              setFormData({ ...formData, ownership_type: e.target.value })
            }
            required
          >
            <option value="">اختر النوع</option>
            <option value="owned">ملك الشركة</option>
            <option value="leased">مستأجر</option>
          </select>
        </div>
        {formData.ownership_type === "leased" && (
          <>
            <div className="form-group">
              <label>اسم شركة التأجير</label>
              <input
                type="text"
                value={formData.lease_company_name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lease_company_name: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>معلومات الاتصال</label>
              <input
                type="text"
                value={formData.lease_contact_info}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lease_contact_info: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>رقم عقد التأجير</label>
              <input
                type="text"
                value={formData.lease_contract_number}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lease_contract_number: e.target.value,
                  })
                }
              />
            </div>
            <UnifiedDatePicker
              label="تاريخ بداية التأجير"
              hijriValue={formData.lease_start_date_hijri || ""}
              gregorianValue={formData.lease_start_date_gregorian || ""}
              onChange={(hijri, gregorian) =>
                setFormData({
                  ...formData,
                  lease_start_date_hijri: hijri || "",
                  lease_start_date_gregorian: gregorian || null,
                })
              }
              dateType="general"
              defaultCalendarType="gregorian"
            />
            <UnifiedDatePicker
              label="تاريخ نهاية التأجير"
              hijriValue={formData.lease_end_date_hijri || ""}
              gregorianValue={formData.lease_end_date_gregorian || ""}
              onChange={(hijri, gregorian) => {
                setFormData({
                  ...formData,
                  lease_end_date_hijri: hijri || "",
                  lease_end_date_gregorian: gregorian || null,
                });
              }}
              dateType="general"
              defaultCalendarType="gregorian"
            />
          </>
        )}
        <div className="form-group full-width">
          <label>وصف خط سير الحافلة</label>
          <textarea
            value={formData.route_description}
            onChange={(e) =>
              setFormData({ ...formData, route_description: e.target.value })
            }
            rows="3"
          />
        </div>

        {isMainManager && (
          <>
            <div className="form-group">
              <label>شركة التأمين</label>
              <input
                type="text"
                value={formData.insurance_provider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    insurance_provider: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>رقم بوليصة التأمين</label>
              <input
                type="text"
                value={formData.insurance_policy_number}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    insurance_policy_number: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>تاريخ انتهاء التأمين</label>
              <input
                type="date"
                value={formData.insurance_expiry_date_gregorian || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    insurance_expiry_date_gregorian: e.target.value || null,
                  })
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StudentsFormTab = ({ students, onUpdate, onRemove }) => {
  const visibleRows = Array.isArray(students) ? students : [];
  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>الطلاب</h3>
      </div>

      <div className="students-table-wrapper">
        <table className="students-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>رقم الجوال</th>
              <th>ملاحظات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((student, index) => (
              <tr key={index}>
                <td>
                  <input
                    type="text"
                    value={student.student_full_name || ""}
                    onChange={(e) =>
                      onUpdate(index, "student_full_name", e.target.value)
                    }
                    placeholder="اسم الطالب"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    dir="ltr"
                    value={student.contact_mobile_number || ""}
                    onChange={(e) =>
                      onUpdate(index, "contact_mobile_number", e.target.value)
                    }
                    placeholder="05xxxxxxxx"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={student.address || ""}
                    onChange={(e) => onUpdate(index, "address", e.target.value)}
                    placeholder="ملاحظات (اختياري)"
                  />
                </td>
                <td className="students-table-actions">
                  <button
                    type="button"
                    className="btn-delete"
                    onClick={() => onRemove(index)}
                    disabled={visibleRows.length <= 1}
                    title="حذف"
                  >
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="students-table-hint">
          اكتب البيانات وسيتم إضافة صف جديد تلقائيًا.
        </div>
      </div>
    </div>
  );
};

// Bus Details Section Component (Consolidated Dashboard View)
const BusDetailsSection = ({ bus, onClose, onEdit, onReload, showEditForm, branches, terms, isMainManager, userBranchId }) => {
  const { showError, showSuccess } = useNotification();
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);

  useEffect(() => {
    loadStudents();
  }, [bus.id]);

  const loadStudents = async () => {
    try {
      setLoadingStudents(true);
      const response = await busTransportationAPI.getStudents(bus.id);
      if (response.data.success) {
        setStudents(response.data.data || []);
      }
    } catch (error) {
      showError("فشل تحميل بيانات الطلاب");
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الطالب؟")) return;
    try {
      const response = await busTransportationAPI.deleteStudent(bus.id, studentId);
      if (response.data.success) {
        showSuccess("تم حذف الطالب بنجاح");
        loadStudents();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل حذف الطالب");
    }
  };

  const availableSeats = bus.details?.number_of_seats
    ? Math.max(0, bus.details.number_of_seats - (bus.student_count || 0))
    : 0;

  // If in edit mode, show the form instead of details
  if (showEditForm) {
    return (
      <BusFormModal
        bus={bus}
        branches={branches}
        terms={terms}
        isMainManager={isMainManager}
        userBranchId={userBranchId}
        initialTab="basic"
        isInlineEdit={true}
        onClose={onClose}
        onSave={() => { }}
        onReload={onReload}
        onAfterFinish={() => { }}
      />
    );
  }

  return (
    <div className="bus-details-section" id="bus-details-section">
      <div className="details-header">
        <div className="header-title">
          <h2>تفاصيل الحافلة - {bus.bus_number}</h2>
          <span className="bus-id-badge">#{bus.id}</span>
        </div>
        <button className="close-section-btn" onClick={onClose} title="إغلاق">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className="details-content-body">
        {/* Hero Stats */}
        <div className="details-hero-stats">
          <div className="hero-stat-card primary">
            <div className="hero-stat-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="7" r="4" />
                <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              </svg>
            </div>
            <div className="hero-stat-content">
              <div className="hero-stat-value">{bus.details?.number_of_seats || 0}</div>
              <div className="hero-stat-label">المقاعد الكلية</div>
            </div>
          </div>

          <div className="hero-stat-card success">
            <div className="hero-stat-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="hero-stat-content">
              <div className="hero-stat-value">{bus.student_count || 0}</div>
              <div className="hero-stat-label">الطلاب المسجلين</div>
            </div>
          </div>

          <div className={`hero-stat-card ${availableSeats > 0 ? 'info' : 'warning'}`}>
            <div className="hero-stat-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="hero-stat-content">
              <div className="hero-stat-value">{availableSeats}</div>
              <div className="hero-stat-label">المقاعد المتاحة</div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="details-two-column">
          {/* Left Column - Main Info */}
          <div className="details-column">
            {/* Basic Info Card */}
            <div className="detail-section-card">
              <div className="section-card-header">
                <h3>المعلومات الأساسية</h3>
                <div className="section-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                    <circle cx="7" cy="17" r="2" />
                    <path d="M9 17h6" />
                    <circle cx="17" cy="17" r="2" />
                  </svg>
                </div>
              </div>
              <div className="section-card-body">
                <div className="info-row">
                  <span className="info-row-label">رقم الحافلة</span>
                  <div className="plate-display-wrapper">
                    <PlateDisplay value={bus.bus_number} />
                  </div>
                </div>
                <div className="info-row">
                  <span className="info-row-label">الفرع</span>
                  <span className="info-row-value">{bus.branch_name}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">المسار</span>
                  <span className="info-row-value">{bus.details?.route_name || "غير محدد"}</span>
                </div>
                {bus.details?.route_description && (
                  <div className="info-row column">
                    <span className="info-row-label">وصف المسار</span>
                    <span className="info-row-value">{bus.details.route_description}</span>
                  </div>
                )}
                <div className="info-row">
                  <span className="info-row-label">نوع الملكية</span>
                  <span className="modern-badge primary">
                    {bus.details?.ownership_type === 'leased' ? 'مستأجر' : 'ملك الشركة'}
                  </span>
                </div>
              </div>
            </div>

            {/* Registration Card */}
            <div className="detail-section-card">
              <div className="section-card-header">
                <h3>رخصة السير</h3>
                <div className="section-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              </div>
              <div className="section-card-body">
                <div className="info-row">
                  <span className="info-row-label">رقم التسلسل</span>
                  <span className="info-row-value">{bus.registration?.registration_number || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">رقم الشاصي</span>
                  <span className="info-row-value">{bus.registration?.chassis_number || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">الموديل</span>
                  <span className="info-row-value">{bus.registration?.vehicle_model || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">سنة الصنع</span>
                  <span className="info-row-value">{bus.registration?.model_year || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">اللون</span>
                  <span className="info-row-value">{bus.registration?.vehicle_color || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">تاريخ الانتهاء</span>
                  <span className="info-row-value">
                    {bus.registration?.expiry_date_gregorian || "-"}
                  </span>
                </div>
                {bus.registration?.registration_document_url && (
                  <a
                    href={bus.registration.registration_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="document-link-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    عرض المستند
                  </a>
                )}
              </div>
            </div>

            {/* Driver License Card */}
            <div className="detail-section-card">
              <div className="section-card-header">
                <h3>بيانات السائق</h3>
                <div className="section-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>
              <div className="section-card-body">
                <div className="info-row">
                  <span className="info-row-label">الاسم الكامل</span>
                  <span className="info-row-value">{bus.driver_license?.driver_full_name || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">رقم الهوية/الإقامة</span>
                  <span className="info-row-value">{bus.driver_license?.driver_id_number || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">رقم الرخصة</span>
                  <span className="info-row-value">{bus.driver_license?.license_number || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">رقم الجوال</span>
                  <span className="info-row-value">{bus.driver_license?.driver_phone_number || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">الجنسية</span>
                  <span className="info-row-value">{bus.driver_license?.driver_nationality || "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-row-label">تاريخ الانتهاء</span>
                  <span className="info-row-value">
                    {bus.driver_license?.expiry_date_gregorian || "-"}
                  </span>
                </div>
                {bus.driver_license?.has_assistant && (
                  <>
                    <div className="info-divider"></div>
                    <div className="info-row">
                      <span className="info-row-label">مرافق السائق</span>
                      <span className="info-row-value">{bus.driver_license.assistant_full_name || "-"}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-row-label">رقم جوال المرافق</span>
                      <span className="info-row-value">{bus.driver_license.assistant_phone_number || "-"}</span>
                    </div>
                  </>
                )}
                {bus.driver_license?.license_document_url && (
                  <a
                    href={bus.driver_license.license_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="document-link-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    عرض الرخصة
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Students & Additional Info */}
          <div className="details-column">
            {/* Students List Card */}
            <div className="detail-section-card students-card">
              <div className="section-card-header">
                <h3>الطلاب ({students.length})</h3>
                <button className="add-student-btn" onClick={() => setShowStudentForm(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  إضافة طالب
                </button>
              </div>
              <div className="section-card-body students-list-body">
                {loadingStudents ? (
                  <div className="loading-state">جاري التحميل...</div>
                ) : students.length === 0 ? (
                  <div className="empty-state-mini">لا يوجد طلاب مسجلين</div>
                ) : (
                  <div className="students-compact-list">
                    {students.map((student, idx) => (
                      <div key={student.id || idx} className="student-compact-item">
                        <div className="student-avatar">{(student.student_full_name || '?').charAt(0)}</div>
                        <div className="student-compact-info">
                          <div className="student-compact-name">{student.student_full_name}</div>
                          <div className="student-compact-phone">{student.contact_mobile_number}</div>
                        </div>
                        <div className="student-compact-actions">
                          <button
                            className="icon-btn edit"
                            onClick={() => {
                              setEditingStudent(student);
                              setShowStudentForm(true);
                            }}
                            title="تعديل"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            className="icon-btn delete"
                            onClick={() => handleDeleteStudent(student.id)}
                            title="حذف"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Additional Details Card - if leased */}
            {bus.details?.ownership_type === 'leased' && (
              <div className="detail-section-card">
                <div className="section-card-header">
                  <h3>معلومات التأجير</h3>
                  <div className="section-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                </div>
                <div className="section-card-body">
                  <div className="info-row">
                    <span className="info-row-label">شركة التأجير</span>
                    <span className="info-row-value">{bus.details.lease_company_name || "-"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row-label">رقم العقد</span>
                    <span className="info-row-value">{bus.details.lease_contract_number || "-"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row-label">تاريخ البداية</span>
                    <span className="info-row-value">{bus.details.lease_start_date_gregorian || "-"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-row-label">تاريخ النهاية</span>
                    <span className="info-row-value">{bus.details.lease_end_date_gregorian || "-"}</span>
                  </div>
                  {bus.lease_contract_document_url && (
                    <a
                      href={bus.lease_contract_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="document-link-btn"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      عرض عقد التأجير
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="details-actions-bar">
        <button onClick={onEdit} className="btn-primary">
          تعديل كامل
        </button>
        <button onClick={onClose} className="btn-secondary">إغلاق</button>
      </div>

      {showStudentForm && (
        <StudentFormModal
          bus={bus}
          student={editingStudent}
          onClose={() => {
            setShowStudentForm(false);
            setEditingStudent(null);
          }}
          onSave={async (data) => {
            try {
              if (editingStudent) {
                await busTransportationAPI.updateStudent(
                  bus.id,
                  editingStudent.id,
                  data,
                );
              } else {
                await busTransportationAPI.addStudent(bus.id, data);
              }
              showSuccess(
                editingStudent
                  ? "تم تحديث الطالب بنجاح"
                  : "تم إضافة الطالب بنجاح",
              );
              setShowStudentForm(false);
              setEditingStudent(null);
              loadStudents();
              onReload();
            } catch (error) {
              showError(error.response?.data?.message || "فشل حفظ الطالب");
            }
          }}
        />
      )}
    </div>
  );
};

// Registration Tab Component
const RegistrationTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const [formData, setFormData] = useState({
    registration_number: bus.registration?.registration_number || "",
    chassis_number: bus.registration?.chassis_number || "",
    vehicle_model: bus.registration?.vehicle_model || "",
    model_year: bus.registration?.model_year || "",
    vehicle_color: bus.registration?.vehicle_color || "",
    expiry_date_hijri: bus.registration?.expiry_date_hijri || "",
    expiry_date_gregorian: bus.registration?.expiry_date_gregorian || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await busTransportationAPI.saveRegistration(
        bus.id,
        formData,
      );
      if (response.data.success) {
        showSuccess("تم حفظ بيانات التسجيل بنجاح");
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ بيانات التسجيل");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const response = await busTransportationAPI.uploadRegistrationDocument(
        bus.id,
        file,
      );
      if (response.data.success) {
        showSuccess("تم رفع المستند بنجاح");
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل رفع المستند");
    } finally {
      setUploading(false);
      e.target.value = ""; // Reset file input
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>بيانات تسجيل الحافلة</h3>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>

      {bus.registration?.registration_document_url && (
        <div className="document-preview">
          <a
            href={bus.registration.registration_document_url}
            target="_blank"
            rel="noopener noreferrer"
            className="document-link"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <polyline
                points="14 2 14 8 20 8"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            عرض مستند التسجيل
          </a>
        </div>
      )}

      <div className="file-upload-section">
        <label className="file-upload-label">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          {uploading
            ? "جاري الرفع..."
            : bus.registration?.registration_document_url
              ? "استبدال المستند"
              : "رفع مستند التسجيل"}
        </label>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>رقم التسلسل *</label>
          <input
            type="text"
            value={formData.registration_number}
            onChange={(e) =>
              setFormData({ ...formData, registration_number: e.target.value })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الشاصي *</label>
          <input
            type="text"
            value={formData.chassis_number}
            onChange={(e) =>
              setFormData({ ...formData, chassis_number: e.target.value })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>الموديل *</label>
          <input
            type="text"
            value={formData.vehicle_model}
            onChange={(e) =>
              setFormData({ ...formData, vehicle_model: e.target.value })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>سنة الصنع</label>
          <input
            type="number"
            value={formData.model_year || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                model_year: e.target.value ? parseInt(e.target.value) : null,
              })
            }
          />
        </div>
        <div className="form-group">
          <label>اللون</label>
          <input
            type="text"
            value={formData.vehicle_color}
            onChange={(e) =>
              setFormData({ ...formData, vehicle_color: e.target.value })
            }
          />
        </div>
        <UnifiedDatePicker
          label="تاريخ الانتهاء"
          hijriValue={formData.expiry_date_hijri || ""}
          gregorianValue={formData.expiry_date_gregorian || ""}
          onChange={(hijri, gregorian) =>
            setFormData({
              ...formData,
              expiry_date_hijri: hijri || null,
              expiry_date_gregorian: gregorian || null,
            })
          }
          dateType="general"
          defaultCalendarType="gregorian"
        />
      </div>
    </div>
  );
};

// Driver License Tab Component
const DriverLicenseTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
  const [formData, setFormData] = useState({
    driver_full_name: bus.driver_license?.driver_full_name || "",
    driver_id_number: bus.driver_license?.driver_id_number || "",
    license_number: bus.driver_license?.license_number || "",
    issue_date_hijri: bus.driver_license?.issue_date_hijri || "",
    issue_date_gregorian: bus.driver_license?.issue_date_gregorian || "",
    expiry_date_hijri: bus.driver_license?.expiry_date_hijri || "",
    expiry_date_gregorian: bus.driver_license?.expiry_date_gregorian || "",
    driver_phone_number: bus.driver_license?.driver_phone_number || "",
    driver_nationality: bus.driver_license?.driver_nationality || "",
    driver_date_of_birth_hijri:
      bus.driver_license?.driver_date_of_birth_hijri || "",
    driver_date_of_birth_gregorian:
      bus.driver_license?.driver_date_of_birth_gregorian || "",
    has_assistant: bus.driver_license?.has_assistant || false,
    assistant_full_name: bus.driver_license?.assistant_full_name || "",
    assistant_phone_number: bus.driver_license?.assistant_phone_number || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await busTransportationAPI.saveDriverLicense(
        bus.id,
        formData,
      );
      if (response.data.success) {
        showSuccess("تم حفظ بيانات رخصة السائق بنجاح");
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ بيانات رخصة السائق");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const response = await busTransportationAPI.uploadDriverLicenseDocument(
        bus.id,
        file,
      );
      if (response.data.success) {
        showSuccess("تم رفع المستند بنجاح");
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل رفع المستند");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>بيانات رخصة السائق</h3>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>

      {bus.driver_license?.license_document_url && (
        <div className="document-preview">
          <a
            href={bus.driver_license.license_document_url}
            target="_blank"
            rel="noopener noreferrer"
            className="document-link"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <polyline
                points="14 2 14 8 20 8"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            عرض رخصة السائق
          </a>
        </div>
      )}

      <div className="file-upload-section">
        <label className="file-upload-label">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileUpload}
            disabled={uploading}
          />
          {uploading
            ? "جاري الرفع..."
            : bus.driver_license?.license_document_url
              ? "استبدال المستند"
              : "رفع رخصة السائق"}
        </label>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>اسم السائق الكامل *</label>
          <input
            type="text"
            value={formData.driver_full_name}
            onChange={(e) =>
              setFormData({ ...formData, driver_full_name: e.target.value })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الهوية/الإقامة *</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.driver_id_number}
            onChange={(e) =>
              setFormData({
                ...formData,
                driver_id_number: digitsOnly(e.target.value),
              })
            }
            required
          />
        </div>
        <div className="form-group">
          <label>رقم الرخصة *</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.license_number}
            onChange={(e) =>
              setFormData({
                ...formData,
                license_number: digitsOnly(e.target.value),
              })
            }
            required
          />
        </div>
        <div className="form-group full-width assistant-section">
          <div className="assistant-toggle-row">
            <span className="assistant-toggle-label">
              هل يوجد مرافق للسائق؟
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!formData.has_assistant}
                onChange={(e) => {
                  const has = e.target.checked;
                  setFormData({
                    ...formData,
                    has_assistant: has,
                    assistant_full_name: has
                      ? formData.assistant_full_name || ""
                      : "",
                    assistant_phone_number: has
                      ? formData.assistant_phone_number || ""
                      : "",
                  });
                }}
              />
              <span className="slider"></span>
            </label>
          </div>

          {formData.has_assistant && (
            <div className="assistant-fields">
              <div className="assistant-fields-grid">
                <div className="form-group">
                  <label>اسم مرافق السائق *</label>
                  <input
                    type="text"
                    value={formData.assistant_full_name || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        assistant_full_name: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>رقم جوال مرافق السائق *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    dir="ltr"
                    value={formData.assistant_phone_number || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        assistant_phone_number: digitsOnly(e.target.value),
                      })
                    }
                    required
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <UnifiedDatePicker
          label="تاريخ الإصدار"
          hijriValue={formData.issue_date_hijri || ""}
          gregorianValue={formData.issue_date_gregorian || ""}
          onChange={(hijri, gregorian) => {
            setFormData({
              ...formData,
              issue_date_hijri: hijri || null,
              issue_date_gregorian: gregorian || null,
            });
          }}
          dateType="general"
          defaultCalendarType="gregorian"
        />
        <UnifiedDatePicker
          label="تاريخ الانتهاء"
          hijriValue={formData.expiry_date_hijri || ""}
          gregorianValue={formData.expiry_date_gregorian || ""}
          onChange={(hijri, gregorian) => {
            setFormData({
              ...formData,
              expiry_date_hijri: hijri || null,
              expiry_date_gregorian: gregorian || null,
            });
          }}
          dateType="general"
          defaultCalendarType="gregorian"
        />
        <div className="form-group">
          <label>رقم هاتف السائق</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            value={formData.driver_phone_number}
            onChange={(e) =>
              setFormData({
                ...formData,
                driver_phone_number: digitsOnly(e.target.value),
              })
            }
          />
        </div>
        <div className="form-group">
          <label>جنسية السائق</label>
          <input
            type="text"
            value={formData.driver_nationality}
            onChange={(e) =>
              setFormData({ ...formData, driver_nationality: e.target.value })
            }
          />
        </div>
        <UnifiedDatePicker
          label="تاريخ الميلاد"
          hijriValue={formData.driver_date_of_birth_hijri || ""}
          gregorianValue={formData.driver_date_of_birth_gregorian || ""}
          onChange={(hijri, gregorian) => {
            setFormData({
              ...formData,
              driver_date_of_birth_hijri: hijri || null,
              driver_date_of_birth_gregorian: gregorian || null,
            });
          }}
          dateType="birth_date"
          defaultCalendarType="gregorian"
        />
      </div>
    </div>
  );
};

// License Plates Tab Component
const LicensePlatesTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const [plates, setPlates] = useState(bus.license_plates || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlate, setEditingPlate] = useState(null);
  const [formData, setFormData] = useState({
    plate_number: "",
    is_primary: true,
  });

  useEffect(() => {
    setPlates(bus.license_plates || []);
  }, [bus.license_plates]);

  const loadPlates = async () => {
    try {
      const response = await busTransportationAPI.getById(bus.id);
      if (response.data.success) {
        setPlates(response.data.data.license_plates || []);
      }
    } catch (error) {
      showError("فشل تحميل لوحات الترخيص");
    }
  };

  const handleAdd = () => {
    setFormData({
      plate_number: "",
      is_primary: true,
    });
    setEditingPlate(null);
    setShowAddForm(true);
  };

  const handleEdit = (plate) => {
    setFormData({
      plate_number: plate.plate_number,
      is_primary: true,
    });
    setEditingPlate(plate);
    setShowAddForm(true);
  };

  const handleSave = async () => {
    if (!formData.plate_number) {
      showError("يرجى إدخال رقم اللوحة");
      return;
    }

    try {
      if (editingPlate) {
        await busTransportationAPI.updateLicensePlate(
          bus.id,
          editingPlate.id,
          formData,
        );
        showSuccess("تم تحديث لوحة الترخيص بنجاح");
      } else {
        await busTransportationAPI.addLicensePlate(bus.id, formData);
        showSuccess("تم إضافة لوحة الترخيص بنجاح");
      }
      setShowAddForm(false);
      setEditingPlate(null);
      loadPlates();
      onReload();
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ لوحة الترخيص");
    }
  };

  const handleDelete = async (plateId) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه اللوحة؟")) return;

    try {
      await busTransportationAPI.deleteLicensePlate(bus.id, plateId);
      showSuccess("تم حذف لوحة الترخيص بنجاح");
      loadPlates();
      onReload();
    } catch (error) {
      showError(error.response?.data?.message || "فشل حذف لوحة الترخيص");
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>لوحات الترخيص</h3>
        <button className="btn-primary" onClick={handleAdd}>
          إضافة لوحة
        </button>
      </div>

      {showAddForm && (
        <div className="plate-form-card">
          <h4>
            {editingPlate ? "تعديل لوحة الترخيص" : "إضافة لوحة ترخيص جديدة"}
          </h4>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>رقم اللوحة *</label>
              <SaudiPlateInput
                value={formData.plate_number || ""}
                onChange={(value) =>
                  setFormData({ ...formData, plate_number: value })
                }
              />
            </div>
          </div>
          <div className="form-actions">
            <button
              onClick={() => {
                setShowAddForm(false);
                setEditingPlate(null);
              }}
            >
              إلغاء
            </button>
            <button className="btn-primary" onClick={handleSave}>
              حفظ
            </button>
          </div>
        </div>
      )}

      <div className="plates-list">
        {plates.length === 0 ? (
          <div className="empty-state">لا توجد لوحات ترخيص</div>
        ) : (
          plates.map((plate) => (
            <div
              key={plate.id}
              className={`plate-item ${plate.is_primary ? "primary" : ""}`}
            >
              <div className="plate-info">
                <div className="plate-number">{plate.plate_number}</div>
                {plate.is_primary && (
                  <span className="primary-badge">أساسية</span>
                )}
              </div>
              <div className="plate-actions">
                <button onClick={() => handleEdit(plate)}>تعديل</button>
                <button onClick={() => handleDelete(plate.id)}>حذف</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Bus Details Tab Component
const BusDetailsTab = ({ bus, onReload }) => {
  const { showError, showSuccess } = useNotification();
  const { isMainManager } = useAuth();
  const normalizeOwnershipType = (v) =>
    v === "rented" ? "leased" : v || "owned";
  const [formData, setFormData] = useState({
    route_name: bus.details?.route_name || "",
    route_description: bus.details?.route_description || "",
    number_of_seats: bus.details?.number_of_seats || "",
    ownership_type: normalizeOwnershipType(bus.details?.ownership_type),
    lease_company_name: bus.details?.lease_company_name || "",
    lease_contact_info: bus.details?.lease_contact_info || "",
    lease_contract_number: bus.details?.lease_contract_number || "",
    lease_start_date_hijri: bus.details?.lease_start_date_hijri || "",
    lease_start_date_gregorian: bus.details?.lease_start_date_gregorian || "",
    lease_end_date_hijri: bus.details?.lease_end_date_hijri || "",
    lease_end_date_gregorian: bus.details?.lease_end_date_gregorian || "",
    insurance_provider: bus.details?.insurance_provider || "",
    insurance_policy_number: bus.details?.insurance_policy_number || "",
    insurance_expiry_date_gregorian:
      bus.details?.insurance_expiry_date_gregorian || "",
    // removed fields intentionally
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.number_of_seats || !formData.ownership_type) {
      showError("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    try {
      setSaving(true);
      const response = await busTransportationAPI.saveDetails(bus.id, {
        ...formData,
        number_of_seats: parseInt(formData.number_of_seats),
      });
      if (response.data.success) {
        showSuccess("تم حفظ تفاصيل الحافلة بنجاح");
        onReload();
      }
    } catch (error) {
      showError(error.response?.data?.message || "فشل حفظ تفاصيل الحافلة");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <h3>تفاصيل الحافلة</h3>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>خط السير</label>
          <input
            type="text"
            value={formData.route_name}
            onChange={(e) =>
              setFormData({ ...formData, route_name: e.target.value })
            }
          />
        </div>
        <div className="form-group full-width">
          <label>وصف خط سير الحافلة</label>
          <textarea
            value={formData.route_description}
            onChange={(e) =>
              setFormData({ ...formData, route_description: e.target.value })
            }
            rows="3"
          />
        </div>
        <div className="form-group">
          <label>عدد المقاعد *</label>
          <input
            type="number"
            value={formData.number_of_seats}
            onChange={(e) =>
              setFormData({ ...formData, number_of_seats: e.target.value })
            }
            required
            min="1"
          />
        </div>
        <div className="form-group">
          <label>نوع الملكية *</label>
          <select
            value={formData.ownership_type}
            onChange={(e) =>
              setFormData({ ...formData, ownership_type: e.target.value })
            }
            required
          >
            <option value="owned">ملك الشركة</option>
            <option value="leased">مستأجر</option>
          </select>
        </div>

        {formData.ownership_type === "leased" && (
          <>
            <div className="form-group">
              <label>اسم شركة التأجير</label>
              <input
                type="text"
                value={formData.lease_company_name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lease_company_name: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>معلومات الاتصال</label>
              <input
                type="text"
                value={formData.lease_contact_info}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lease_contact_info: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>رقم عقد التأجير</label>
              <input
                type="text"
                value={formData.lease_contract_number}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    lease_contract_number: e.target.value,
                  })
                }
              />
            </div>
            <UnifiedDatePicker
              label="تاريخ بداية التأجير"
              hijriValue={formData.lease_start_date_hijri || ""}
              gregorianValue={formData.lease_start_date_gregorian || ""}
              onChange={(hijri, gregorian) => {
                setFormData({
                  ...formData,
                  lease_start_date_hijri: hijri || "",
                  lease_start_date_gregorian: gregorian || null,
                });
              }}
              dateType="general"
              defaultCalendarType="gregorian"
            />
            <UnifiedDatePicker
              label="تاريخ نهاية التأجير"
              hijriValue={formData.lease_end_date_hijri || ""}
              gregorianValue={formData.lease_end_date_gregorian || ""}
              onChange={(hijri, gregorian) => {
                setFormData({
                  ...formData,
                  lease_end_date_hijri: hijri || "",
                  lease_end_date_gregorian: gregorian || null,
                });
              }}
              dateType="general"
              defaultCalendarType="gregorian"
            />
          </>
        )}

        {isMainManager && (
          <>
            <div className="form-group">
              <label>شركة التأمين</label>
              <input
                type="text"
                value={formData.insurance_provider}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    insurance_provider: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>رقم بوليصة التأمين</label>
              <input
                type="text"
                value={formData.insurance_policy_number}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    insurance_policy_number: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label>تاريخ انتهاء التأمين</label>
              <input
                type="date"
                value={formData.insurance_expiry_date_gregorian || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    insurance_expiry_date_gregorian: e.target.value || null,
                  })
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StudentsTab = ({
  bus,
  students,
  loading,
  onReload,
  onAdd,
  onEdit,
  onDelete,
}) => (
  <div className="tab-panel">
    <div className="students-header">
      <h3>قائمة الطلاب</h3>
      <button className="btn-primary" onClick={onAdd}>
        إضافة طالب
      </button>
    </div>
    {loading ? (
      <div className="loading">جاري التحميل...</div>
    ) : students.length === 0 ? (
      <div className="empty-state">لا يوجد طلاب</div>
    ) : (
      <div className="students-list">
        {students.map((student) => (
          <div key={student.id} className="student-item">
            <div className="student-info">
              <div className="student-name">{student.student_full_name}</div>
              <div className="student-contact">
                {student.contact_mobile_number}
              </div>
              {student.address && (
                <div className="student-address">{student.address}</div>
              )}
            </div>
            <div className="student-actions">
              <button onClick={() => onEdit(student)}>تعديل</button>
              <button onClick={() => onDelete(student.id)}>حذف</button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

const StudentFormModal = ({ bus, student, onClose, onSave }) => {
  const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
  const { showWarning } = useNotification();
  const [formData, setFormData] = useState({
    student_full_name: student?.student_full_name || "",
    contact_mobile_number: student?.contact_mobile_number || "",
    address: student?.address || "",
    term_id: student?.term_id || bus?.term_id || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (
      !formData.student_full_name ||
      !formData.contact_mobile_number ||
      !formData.address
    ) {
      showWarning("يرجى ملء جميع الحقول المطلوبة");
      return;
    }

    // Ensure term_id is set from bus if not already set
    const submitData = {
      ...formData,
      term_id: formData.term_id || bus?.term_id,
    };

    setSaving(true);
    try {
      await onSave(submitData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{student ? "تعديل الطالب" : "إضافة طالب جديد"}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="student-form">
          <div className="form-group">
            <label>الاسم الكامل *</label>
            <input
              type="text"
              value={formData.student_full_name}
              onChange={(e) =>
                setFormData({ ...formData, student_full_name: e.target.value })
              }
              required
            />
          </div>
          <div className="form-group">
            <label>رقم الجوال *</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              dir="ltr"
              value={formData.contact_mobile_number}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  contact_mobile_number: digitsOnly(e.target.value),
                })
              }
              required
            />
          </div>
          <div className="form-group">
            <label>العنوان *</label>
            <textarea
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              required
            />
          </div>
          <input type="hidden" value={formData.term_id || bus?.term_id || ""} />
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              إلغاء
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BusTransportation;
