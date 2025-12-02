# Employee Helpers (Backend) - دليل استخدام دوال الموظفين

هذا الملف يحتوي على دوال موحدة للتحقق من الحالات الخاصة للموظفين في الباك اند. يجب استخدام هذه الدوال لضمان الثبات والاستقرار بين الواجهة الأمامية والخلفية.

## 📋 المحتويات

1. [دوال الجنسية](#دوال-الجنسية)
2. [دوال نوع الفرع](#دوال-نوع-الفرع)
3. [دوال المسمى الوظيفي](#دوال-المسمى-الوظيفي)
4. [دوال المستندات المطلوبة](#دوال-المستندات-المطلوبة)
5. [دوال التحقق](#دوال-التحقق)

---

## دوال الجنسية

### `isSaudi(nationality)`

التحقق من كون الموظف سعودي.

```javascript
import { isSaudi } from "../utils/employeeHelpers.js";

if (isSaudi(employee.nationality)) {
  // الموظف سعودي
}
```

### `isNonSaudi(nationality)`

التحقق من كون الموظف غير سعودي.

```javascript
import { isNonSaudi } from "../utils/employeeHelpers.js";

if (isNonSaudi(employee.nationality)) {
  // الموظف غير سعودي
}
```

### `getIdTypeFromNationality(nationality)`

الحصول على نوع الهوية حسب الجنسية.

```javascript
import { getIdTypeFromNationality } from "../utils/employeeHelpers.js";

const idType = getIdTypeFromNationality(employee.nationality);
// Returns: 'citizen' or 'resident'
```

---

## دوال نوع الفرع

### `isSchool(branchType)`

التحقق من كون الفرع مدرسة.

```javascript
import { isSchool } from "../utils/employeeHelpers.js";

if (isSchool(branch.branch_type)) {
  // الفرع مدرسة
}
```

### `isHealthcareCenter(branchType)`

التحقق من كون الفرع مركز رعاية نهارية.

```javascript
import { isHealthcareCenter } from "../utils/employeeHelpers.js";

if (isHealthcareCenter(branch.branch_type)) {
  // الفرع مركز رعاية نهارية
}
```

---

## دوال المسمى الوظيفي

### `requiresClassification(jobTitle)`

التحقق من كون المسمى الوظيفي يتطلب تصنيف.

```javascript
import { requiresClassification } from "../utils/employeeHelpers.js";

if (requiresClassification(employee.job_title)) {
  // المسمى الوظيفي يتطلب تصنيف
}
```

### `requiresExperienceCertificate(jobTitle, branchType)`

التحقق من كون المسمى الوظيفي يتطلب شهادة خبرة.

```javascript
import { requiresExperienceCertificate } from "../utils/employeeHelpers.js";

if (requiresExperienceCertificate(employee.job_title, employee.branch_type)) {
  // المسمى الوظيفي يتطلب شهادة خبرة
}
```

---

## دوال المستندات المطلوبة

### `requiresPassport(nationality)`

التحقق من كون جواز السفر مطلوب.

```javascript
import { requiresPassport } from "../utils/employeeHelpers.js";

if (requiresPassport(employee.nationality)) {
  // جواز السفر مطلوب
}
```

### `requiresProfessionalLicense(branchType)`

التحقق من كون الترخيص المهني مطلوب.

```javascript
import { requiresProfessionalLicense } from "../utils/employeeHelpers.js";

if (requiresProfessionalLicense(branch.branch_type)) {
  // الترخيص المهني مطلوب
}
```

---

## دوال التحقق

### `validateDocumentType(documentType, employee)`

التحقق من كون نوع المستند مسموح للموظف. **هذه الدالة مهمة جداً** ويجب استخدامها عند رفع المستندات.

```javascript
import { validateDocumentType } from "../utils/employeeHelpers.js";

const validation = validateDocumentType("classification", {
  nationality: employee.nationality,
  job_title: employee.job_title,
  branch_type: branch.branch_type,
});

if (!validation.allowed) {
  return res.status(400).json({
    success: false,
    message: validation.reason,
  });
}
```

---

## مثال على الاستخدام في Routes

```javascript
import { validateDocumentType } from "../utils/employeeHelpers.js";

router.post("/documents", async (req, res) => {
  const { document_type, employee_id } = req.body;

  // Get employee and branch data
  const employee = await Employee.findById(employee_id);
  const branch = await Branch.findById(employee.branch_id);

  // Validate document type
  const validation = validateDocumentType(document_type, {
    nationality: employee.nationality,
    job_title: employee.job_title,
    branch_type: branch.branch_type,
  });

  if (!validation.allowed) {
    return res.status(400).json({
      success: false,
      message: validation.reason,
    });
  }

  // Continue with upload...
});
```

---

## ⚠️ ملاحظات مهمة

1. **التزامن مع الواجهة الأمامية**: هذا الملف يجب أن يطابق منطق `react-app/src/utils/employeeHelpers.js`

2. **استخدام في Validation**: استخدم `validateDocumentType` عند رفع المستندات لمنع الأخطاء

3. **التحديثات المركزية**: عند تغيير القواعد، قم بتحديث كلا الملفين (frontend و backend)

---

**آخر تحديث**: 2024
**الملف المرجعي**: استخدم هذا الملف كمرجع عند إجراء أي تعديلات على منطق الموظفين في الباك اند
