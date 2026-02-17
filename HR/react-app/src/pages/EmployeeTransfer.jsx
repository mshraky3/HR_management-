/**
 * Employee Transfer & Multi-Branch Linking Page
 * Main manager only - transfer employees between branches and manage branch links
 */

import { useState, useEffect, useRef } from "react";
import { employeesAPI, branchesAPI } from "../utils/api";
import { useNotification } from "../contexts/NotificationContext";
import "./EmployeeTransfer.css";
import "./Employees.css";

const EmployeeTransfer = () => {
  const { showSuccess, showError, showWarning } = useNotification();

  // Branches list
  const [branches, setBranches] = useState([]);

  // Search state - separate fields like Employees page
  const [searchFilters, setSearchFilters] = useState({
    search_name: "",
    search_id: "",
    search_phone: "",
  });
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef(null);
  const searchNameRef = useRef(null);

  // Selected employee
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [linkedBranches, setLinkedBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Transfer form
  const [targetBranchId, setTargetBranchId] = useState("");
  const [transferBranchText, setTransferBranchText] = useState("");
  const [transferDropdownOpen, setTransferDropdownOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const transferPickerRef = useRef(null);

  // Link form
  const [linkBranchId, setLinkBranchId] = useState("");
  const [linkBranchText, setLinkBranchText] = useState("");
  const [linkDropdownOpen, setLinkDropdownOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const linkPickerRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (transferPickerRef.current && !transferPickerRef.current.contains(e.target)) {
        setTransferDropdownOpen(false);
      }
      if (linkPickerRef.current && !linkPickerRef.current.contains(e.target)) {
        setLinkDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load branches on mount
  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      const response = await branchesAPI.getAll();
      const data = response.data?.data || response.data || [];
      setBranches(data.filter(b => b.is_active !== false));
    } catch (error) {
      console.error("Error loading branches:", error);
    }
  };

  // Search employees - debounced auto-search
  useEffect(() => {
    const hasQuery = searchFilters.search_name.length >= 2 || 
                     searchFilters.search_id.length >= 1 ||
                     searchFilters.search_phone.length >= 2;
    
    if (!hasQuery) {
      setSearchResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = { page: 1, pageSize: 20 };
        if (searchFilters.search_name.length >= 2) params.search_name = searchFilters.search_name.trim();
        if (searchFilters.search_id.length >= 1) params.search_id = searchFilters.search_id.trim();
        if (searchFilters.search_phone.length >= 2) params.search_phone = searchFilters.search_phone.trim();

        const response = await employeesAPI.getPaginated(params);
        setSearchResults(response.data?.data || []);
      } catch (error) {
        console.error("Error searching employees:", error);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchFilters]);

  // Select employee & load their branches
  const handleSelectEmployee = async (employee) => {
    setSelectedEmployee(employee);
    setSearchResults([]);
    setSearchFilters({ search_name: "", search_id: "", search_phone: "" });
    setTargetBranchId("");
    setTransferBranchText("");
    setLinkBranchId("");
    setLinkBranchText("");
    await loadLinkedBranches(employee.id);
  };

  const loadLinkedBranches = async (employeeId) => {
    setLoadingBranches(true);
    try {
      const response = await employeesAPI.getLinkedBranches(employeeId);
      setLinkedBranches(response.data?.data || []);
    } catch (error) {
      console.error("Error loading linked branches:", error);
      setLinkedBranches([]);
    } finally {
      setLoadingBranches(false);
    }
  };

  // Transfer employee
  const handleTransfer = async () => {
    if (!targetBranchId) {
      showWarning("يرجى اختيار الفرع المستهدف");
      return;
    }

    const targetBranch = branches.find(b => b.id === parseInt(targetBranchId));
    if (!confirm(`هل أنت متأكد من نقل الموظف "${selectedEmployee.full_name || `${selectedEmployee.first_name} ${selectedEmployee.second_name}`}" إلى فرع "${targetBranch?.branch_name}"؟`)) {
      return;
    }

    setTransferring(true);
    try {
      const response = await employeesAPI.transfer(selectedEmployee.id, {
        target_branch_id: parseInt(targetBranchId),
      });
      if (response.data.success) {
        showSuccess(response.data.message);
        // Reload employee data
        const empResponse = await employeesAPI.getById(selectedEmployee.id);
        setSelectedEmployee(empResponse.data?.data || empResponse.data);
        await loadLinkedBranches(selectedEmployee.id);
        setTargetBranchId("");
        setTransferBranchText("");
      }
    } catch (error) {
      console.error("Error transferring employee:", error);
      showError(error.response?.data?.message || "فشل نقل الموظف");
    } finally {
      setTransferring(false);
    }
  };

  // Link to branch
  const handleLink = async () => {
    if (!linkBranchId) {
      showWarning("يرجى اختيار الفرع للربط");
      return;
    }

    setLinking(true);
    try {
      const response = await employeesAPI.linkToBranch({
        employee_id: selectedEmployee.id,
        branch_id: parseInt(linkBranchId),
      });
      if (response.data.success) {
        showSuccess(response.data.message);
        await loadLinkedBranches(selectedEmployee.id);
        setLinkBranchId("");
        setLinkBranchText("");
      }
    } catch (error) {
      console.error("Error linking employee:", error);
      showError(error.response?.data?.message || "فشل ربط الموظف بالفرع");
    } finally {
      setLinking(false);
    }
  };

  // Unlink from branch
  const handleUnlink = async (branchId, branchName) => {
    if (!confirm(`هل أنت متأكد من إلغاء ربط الموظف بفرع "${branchName}"؟`)) return;

    try {
      const response = await employeesAPI.unlinkFromBranch(selectedEmployee.id, branchId);
      if (response.data.success) {
        showSuccess(response.data.message);
        await loadLinkedBranches(selectedEmployee.id);
      }
    } catch (error) {
      console.error("Error unlinking:", error);
      showError(error.response?.data?.message || "فشل إلغاء ربط الموظف");
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedEmployee(null);
    setLinkedBranches([]);
    setTargetBranchId("");
    setTransferBranchText("");
    setLinkBranchId("");
    setLinkBranchText("");
  };

  // Get branch name for display
  const getCurrentBranchName = () => {
    if (!selectedEmployee) return "";
    const branch = branches.find(b => b.id === selectedEmployee.branch_id);
    return branch?.branch_name || "غير محدد";
  };

  // Filter branches for transfer (exclude current primary)
  const transferableBranches = branches.filter(
    b => selectedEmployee && b.id !== selectedEmployee.branch_id
  );

  // Filter branches for linking (exclude already linked)
  const linkableBranches = branches.filter(
    b => !linkedBranches.some(lb => lb.branch_id === b.id)
  );

  // Filtered lists based on text input
  const filteredTransferBranches = transferableBranches.filter(
    b => !transferBranchText || b.branch_name.includes(transferBranchText)
  );
  const filteredLinkBranches = linkableBranches.filter(
    b => !linkBranchText || b.branch_name.includes(linkBranchText)
  );

  return (
    <div className="table-page">
      <div className="page-header">
        <h1>نقل وربط الموظفين</h1>
      </div>

      {/* Search Section - matching Employees page style */}
      <div className="employees-search-bar">
        <div className="employees-search-field">
          <label className="employees-search-label">
            البحث بالاسم:
            {searchFilters.search_name.length > 0 &&
              searchFilters.search_name.length < 2 && (
                <span className="employees-search-hint">
                  (أدخل حرفين على الأقل)
                </span>
              )}
          </label>
          <input
            ref={searchNameRef}
            type="text"
            value={searchFilters.search_name}
            onChange={(e) =>
              setSearchFilters({ ...searchFilters, search_name: e.target.value })
            }
            placeholder="أدخل حرفين على الأقل للبحث (مثال: محمد)"
            className="employees-search-input"
          />
        </div>
        <div className="employees-search-field">
          <label className="employees-search-label">
            البحث برقم الهوية/الإقامة:
          </label>
          <input
            type="text"
            value={searchFilters.search_id}
            onChange={(e) =>
              setSearchFilters({ ...searchFilters, search_id: e.target.value })
            }
            placeholder="أدخل رقم الهوية أو الإقامة"
            className="employees-search-input"
          />
        </div>
        <div className="employees-search-field">
          <label className="employees-search-label">
            البحث برقم الهاتف:
            {searchFilters.search_phone.length > 0 &&
              searchFilters.search_phone.length < 2 && (
                <span className="employees-search-hint">
                  (أدخل حرفين على الأقل)
                </span>
              )}
          </label>
          <input
            type="text"
            value={searchFilters.search_phone}
            onChange={(e) =>
              setSearchFilters({ ...searchFilters, search_phone: e.target.value })
            }
            placeholder="أدخل حرفين على الأقل للبحث"
            className="employees-search-input"
          />
        </div>
      </div>

      {/* Search Results */}
      {searching && (
        <div className="transfer-section" style={{ textAlign: 'center', padding: '16px', color: '#64748b' }}>
          جاري البحث...
        </div>
      )}
      {!searching && searchResults.length > 0 && (
        <div className="transfer-section" style={{ padding: '0' }}>
          <table className="transfer-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>رقم الهوية</th>
                <th>الفرع</th>
                <th>الحالة</th>
                <th>اختيار</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map(emp => (
                <tr key={emp.id}>
                  <td>{emp.full_name || `${emp.first_name} ${emp.second_name} ${emp.third_name || ""} ${emp.fourth_name || ""}`}</td>
                  <td>{emp.id_or_residency_number || "-"}</td>
                  <td>{branches.find(b => b.id === emp.branch_id)?.branch_name || "-"}</td>
                  <td>
                    <span className={`status-badge status-${emp.status || "active"}`}>
                      {emp.status === "active" ? "نشط" : emp.status === "pending" ? "قيد الانتظار" : emp.status || "نشط"}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleSelectEmployee(emp)}
                      className="btn-primary btn-sm"
                    >
                      اختيار
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected Employee Info */}
      {selectedEmployee && (
        <>
          <div className="transfer-section transfer-employee-info">
            <div className="transfer-info-header">
              <h2 className="transfer-section-title">بيانات الموظف المختار</h2>
              <button
                onClick={handleClearSelection}
                className="btn-secondary btn-sm"
              >
                إلغاء الاختيار
              </button>
            </div>
            <div className="transfer-info-grid">
              <div className="transfer-info-item">
                <span className="transfer-info-label">الاسم:</span>
                <span className="transfer-info-value">
                  {selectedEmployee.full_name || `${selectedEmployee.first_name} ${selectedEmployee.second_name} ${selectedEmployee.third_name || ""} ${selectedEmployee.fourth_name || ""}`}
                </span>
              </div>
              <div className="transfer-info-item">
                <span className="transfer-info-label">رقم الهوية:</span>
                <span className="transfer-info-value">{selectedEmployee.id_or_residency_number || "-"}</span>
              </div>
              <div className="transfer-info-item">
                <span className="transfer-info-label">الفرع الأساسي:</span>
                <span className="transfer-info-value transfer-primary-branch">{getCurrentBranchName()}</span>
              </div>
              <div className="transfer-info-item">
                <span className="transfer-info-label">الوظيفة:</span>
                <span className="transfer-info-value">{selectedEmployee.occupation || "-"}</span>
              </div>
            </div>
          </div>

          {/* Transfer Section */}
          <div className="transfer-section">
            <h2 className="transfer-section-title">نقل الموظف إلى فرع آخر</h2>
            <p className="transfer-section-desc">سيتم نقل الموظف وتغيير فرعه الأساسي إلى الفرع المختار</p>
            <div className="transfer-action-row">
              <div className="branch-picker" ref={transferPickerRef}>
                <input
                  type="text"
                  value={transferBranchText}
                  onChange={(e) => {
                    setTransferBranchText(e.target.value);
                    setTargetBranchId("");
                    setTransferDropdownOpen(true);
                  }}
                  onFocus={() => setTransferDropdownOpen(true)}
                  placeholder="ابحث عن الفرع المستهدف..."
                  className="branch-picker-input"
                />
                {transferDropdownOpen && filteredTransferBranches.length > 0 && (
                  <ul className="branch-picker-dropdown">
                    {filteredTransferBranches.map(b => (
                      <li
                        key={b.id}
                        className={`branch-picker-item${targetBranchId === String(b.id) ? " selected" : ""}`}
                        onClick={() => {
                          setTargetBranchId(String(b.id));
                          setTransferBranchText(b.branch_name);
                          setTransferDropdownOpen(false);
                        }}
                      >
                        {b.branch_name}
                      </li>
                    ))}
                  </ul>
                )}
                {transferDropdownOpen && transferBranchText && filteredTransferBranches.length === 0 && (
                  <ul className="branch-picker-dropdown">
                    <li className="branch-picker-empty">لا توجد نتائج</li>
                  </ul>
                )}
              </div>
              <button
                onClick={handleTransfer}
                disabled={transferring || !targetBranchId}
                className="btn-primary"
              >
                {transferring ? "جاري النقل..." : "نقل الموظف"}
              </button>
            </div>
          </div>

          {/* Multi-Branch Linking Section */}
          <div className="transfer-section">
            <h2 className="transfer-section-title">ربط الموظف بفروع إضافية</h2>
            <p className="transfer-section-desc">يمكنك ربط الموظف بعدة فروع مع الاحتفاظ بفرعه الأساسي</p>

            {/* Linked Branches Table */}
            {loadingBranches ? (
              <div className="transfer-loading">جاري تحميل الفروع المرتبطة...</div>
            ) : (
              <table className="transfer-table">
                <thead>
                  <tr>
                    <th>الفرع</th>
                    <th>أساسي</th>
                    <th>تاريخ الربط</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedBranches.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: "center", color: "#999" }}>
                        لا توجد فروع مرتبطة
                      </td>
                    </tr>
                  ) : (
                    linkedBranches.map(lb => (
                      <tr key={lb.branch_id}>
                        <td>{lb.branch_name}</td>
                        <td>
                          {lb.is_primary ? (
                            <span className="transfer-badge transfer-badge-primary">أساسي</span>
                          ) : (
                            <span className="transfer-badge transfer-badge-secondary">إضافي</span>
                          )}
                        </td>
                        <td>{lb.added_at ? new Date(lb.added_at).toLocaleDateString("ar-SA") : "-"}</td>
                        <td>
                          {lb.is_primary ? (
                            <span className="transfer-hint">لا يمكن إلغاء ربط الفرع الأساسي</span>
                          ) : (
                            <button
                              onClick={() => handleUnlink(lb.branch_id, lb.branch_name)}
                              className="btn-danger btn-sm"
                            >
                              إلغاء الربط
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* Add new branch link */}
            {linkableBranches.length > 0 && (
              <div className="transfer-action-row" style={{ marginTop: "16px" }}>
                <div className="branch-picker" ref={linkPickerRef}>
                  <input
                    type="text"
                    value={linkBranchText}
                    onChange={(e) => {
                      setLinkBranchText(e.target.value);
                      setLinkBranchId("");
                      setLinkDropdownOpen(true);
                    }}
                    onFocus={() => setLinkDropdownOpen(true)}
                    placeholder="ابحث عن فرع للربط..."
                    className="branch-picker-input"
                  />
                  {linkDropdownOpen && filteredLinkBranches.length > 0 && (
                    <ul className="branch-picker-dropdown">
                      {filteredLinkBranches.map(b => (
                        <li
                          key={b.id}
                          className={`branch-picker-item${linkBranchId === String(b.id) ? " selected" : ""}`}
                          onClick={() => {
                            setLinkBranchId(String(b.id));
                            setLinkBranchText(b.branch_name);
                            setLinkDropdownOpen(false);
                          }}
                        >
                          {b.branch_name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {linkDropdownOpen && linkBranchText && filteredLinkBranches.length === 0 && (
                    <ul className="branch-picker-dropdown">
                      <li className="branch-picker-empty">لا توجد نتائج</li>
                    </ul>
                  )}
                </div>
                <button
                  onClick={handleLink}
                  disabled={linking || !linkBranchId}
                  className="btn-primary"
                >
                  {linking ? "جاري الربط..." : "ربط بالفرع"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default EmployeeTransfer;
