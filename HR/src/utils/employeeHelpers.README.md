# Employee Helpers - دليل استخدام دوال الموظفين

هذا الملف يحتوي على دوال موحدة للتحقق من الحالات الخاصة للموظفين. يجب استخدام هذه الدوال في جميع أنحاء التطبيق لضمان الثبات والاستقرار.

## 📋 المحتويات

1. [دوال الجنسية](#دوال-الجنسية)
2. [دوال نوع الفرع](#دوال-نوع-الفرع)
3. [دوال المسمى الوظيفي](#دوال-المسمى-الوظيفي)
4. [دوال المستندات المطلوبة](#دوال-المستندات-المطلوبة)
5. [دوال الحقول المطلوبة](#دوال-الحقول-المطلوبة)
6. [دوال التحقق](#دوال-التحقق)

---

## دوال الجنسية

### `isSaudi(nationality)`

التحقق من كون الموظف سعودي.

```javascript
import { isSaudi } from "../utils/employeeHelpers";

if (isSaudi(employee.nationality)) {
  // الموظف سعودي
}
```

### `isNonSaudi(nationality)`

التحقق من كون الموظف غير سعودي.

```javascript
import { isNonSaudi } from "../utils/employeeHelpers";

if (isNonSaudi(employee.nationality)) {
  // الموظف غير سعودي
}
```

### `getIdTypeFromNationality(nationality)`

الحصول على نوع الهوية حسب الجنسية.

```javascript
import { getIdTypeFromNationality } from "../utils/employeeHelpers";

const idType = getIdTypeFromNationality(employee.nationality);
// Returns: 'citizen' or 'resident'
```

### `getDateOfBirthCalendarType(nationality)`

الحصول على نوع التقويم لتاريخ الميلاد.

```javascript
import { getDateOfBirthCalendarType } from "../utils/employeeHelpers";

const calendarType = getDateOfBirthCalendarType(employee.nationality);
// Returns: 'hijri' for Saudis, 'gregorian' for non-Saudis
```

### `getIdExpiryCalendarType(nationality)`

الحصول على نوع التقويم لتاريخ انتهاء الهوية.

```javascript
import { getIdExpiryCalendarType } from "../utils/employeeHelpers";

const calendarType = getIdExpiryCalendarType(employee.nationality);
// Returns: 'gregorian' for non-Saudis, null for Saudis
```

---

## دوال نوع الفرع

### `isSchool(branchType)`

التحقق من كون الفرع مدرسة.

```javascript
import { isSchool } from "../utils/employeeHelpers";

if (isSchool(branch.branch_type)) {
  // الفرع مدرسة
}
```

### `isHealthcareCenter(branchType)`

التحقق من كون الفرع مركز رعاية نهارية.

```javascript
import { isHealthcareCenter } from "../utils/employeeHelpers";

if (isHealthcareCenter(branch.branch_type)) {
  // الفرع مركز رعاية نهارية
}
```

### `getBranchTypeLabel(branchType)`

الحصول على تسمية نوع الفرع بالعربية.

```javascript
import { getBranchTypeLabel } from "../utils/employeeHelpers";

const label = getBranchTypeLabel(branch.branch_type);
// Returns: 'مدرسة' or 'مركز رعاية نهارية'
```

---

## دوال المسمى الوظيفي

### `requiresClassification(jobTitle)`

التحقق من كون المسمى الوظيفي يتطلب تصنيف.

```javascript
import { requiresClassification } from "../utils/employeeHelpers";

if (requiresClassification(employee.job_title)) {
  // المسمى الوظيفي يتطلب تصنيف
  // المهن: علاج طبيعي، علاج وظيفي، اخصائي نفسي، تمريض
}
```

### `requiresExperienceCertificate(jobTitle, branchType)`

التحقق من كون المسمى الوظيفي يتطلب شهادة خبرة.

```javascript
import { requiresExperienceCertificate } from "../utils/employeeHelpers";

if (requiresExperienceCertificate(employee.job_title, employee.branch_type)) {
  // المسمى الوظيفي يتطلب شهادة خبرة
}
```

### `requiresSpeechTherapy70Hours(jobTitle)`

التحقق من كون المسمى الوظيفي يتطلب دورة 70 ساعة.

```javascript
import { requiresSpeechTherapy70Hours } from "../utils/employeeHelpers";

if (requiresSpeechTherapy70Hours(employee.job_title)) {
  // المسمى الوظيفي يتطلب دورة 70 ساعة
  // المسمى: النطق و التخاطب
}
```

### `requiresTherapy40Hours(jobTitle)`

التحقق من كون المسمى الوظيفي يتطلب دورة 40 ساعة.

```javascript
import { requiresTherapy40Hours } from "../utils/employeeHelpers";

if (requiresTherapy40Hours(employee.job_title)) {
  // المسمى الوظيفي يتطلب دورة 40 ساعة
  // المهن: علاج طبيعي، علاج وظيفي
}
```

---

## دوال المستندات المطلوبة

### `requiresPassport(nationality)`

التحقق من كون جواز السفر مطلوب.

```javascript
import { requiresPassport } from "../utils/employeeHelpers";

if (requiresPassport(employee.nationality)) {
  // جواز السفر مطلوب (لغير السعوديين)
}
```

### `requiresProfessionalLicense(branchType)`

التحقق من كون الترخيص المهني مطلوب.

```javascript
import { requiresProfessionalLicense } from "../utils/employeeHelpers";

if (requiresProfessionalLicense(branch.branch_type)) {
  // الترخيص المهني مطلوب (للمدارس)
}
```

### `requiresClassificationDocument(jobTitle)`

التحقق من كون مستند التصنيف مطلوب.

```javascript
import { requiresClassificationDocument } from "../utils/employeeHelpers";

if (requiresClassificationDocument(employee.job_title)) {
  // مستند التصنيف مطلوب
}
```

### `getRequiredDocuments(employee)`

الحصول على قائمة بجميع المستندات المطلوبة للموظف.

```javascript
import { getRequiredDocuments } from "../utils/employeeHelpers";

const requiredDocs = getRequiredDocuments({
  nationality: employee.nationality,
  job_title: employee.job_title,
  branch_type: employee.branch_type,
});
// Returns: ['passport', 'professional_license', 'experience_certificate', ...]
```

---

## دوال الحقول المطلوبة

### `requiresPassportNumber(nationality)`

التحقق من كون رقم جواز السفر مطلوب.

```javascript
import { requiresPassportNumber } from "../utils/employeeHelpers";

if (requiresPassportNumber(employee.nationality)) {
  // رقم جواز السفر مطلوب
}
```

### `requiresIdExpiryDate(nationality)`

التحقق من كون تاريخ انتهاء الهوية مطلوب.

```javascript
import { requiresIdExpiryDate } from "../utils/employeeHelpers";

if (requiresIdExpiryDate(employee.nationality)) {
  // تاريخ انتهاء الهوية مطلوب
}
```

---

## دوال التحقق

### `validateDocumentType(documentType, employee)`

التحقق من كون نوع المستند مسموح للموظف.

```javascript
import { validateDocumentType } from "../utils/employeeHelpers";

const validation = validateDocumentType("classification", {
  nationality: employee.nationality,
  job_title: employee.job_title,
  branch_type: employee.branch_type,
});

if (!validation.allowed) {
  console.error(validation.reason);
  // Example: "شهادة التصنيف مطلوبة فقط للمهن التالية: ..."
}
```

---

## أمثلة على الاستخدام

### مثال 1: التحقق من المستندات المطلوبة

```javascript
import {
  requiresPassport,
  requiresProfessionalLicense,
  requiresClassificationDocument,
} from "../utils/employeeHelpers";

const employee = {
  nationality: "Saudi Arabia",
  job_title: "علاج طبيعي",
  branch_type: "healthcare_center",
};

// التحقق من المستندات المطلوبة
if (requiresPassport(employee.nationality)) {
  // إظهار حقل جواز السفر
}

if (requiresProfessionalLicense(employee.branch_type)) {
  // إظهار حقل الترخيص المهني
}

if (requiresClassificationDocument(employee.job_title)) {
  // إظهار حقل شهادة التصنيف
}
```

### مثال 2: التحقق من نوع الفرع

```javascript
import { isSchool, isHealthcareCenter } from "../utils/employeeHelpers";

const branch = { branch_type: "school" };

if (isSchool(branch.branch_type)) {
  // عرض خيارات المدرسة
} else if (isHealthcareCenter(branch.branch_type)) {
  // عرض خيارات المركز الصحي
}
```

### مثال 3: التحقق من المسمى الوظيفي

```javascript
import {
  requiresClassification,
  requiresExperienceCertificate,
} from "../utils/employeeHelpers";

const employee = {
  job_title: "مدير",
  branch_type: "school",
};

if (requiresExperienceCertificate(employee.job_title, employee.branch_type)) {
  // إظهار حقل شهادة الخبرة
}

if (requiresClassification(employee.job_title)) {
  // إظهار حقل التصنيف
}
```

---

## ⚠️ ملاحظات مهمة

1. **استخدم الدوال الموحدة دائماً**: لا تكتب منطق التحقق مباشرة في الكود، استخدم هذه الدوال.

2. **تجنب التكرار**: إذا كنت تكرر نفس المنطق في عدة أماكن، أضف دالة جديدة هنا.

3. **التحديثات المركزية**: عند تغيير القواعد، قم بتحديث هذا الملف فقط.

4. **التحقق من القيم الفارغة**: بعض الدوال قد ترجع `false` إذا كانت القيمة `null` أو `undefined`، تأكد من التحقق.

---

**آخر تحديث**: 2024
**الملف المرجعي**: استخدم هذا الملف كمرجع عند إجراء أي تعديلات على منطق الموظفين
