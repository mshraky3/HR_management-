# Employee Rules System - دليل الاستخدام

## نظرة عامة

تم إنشاء نظام قواعد موحد (Rule-Based System) لتسهيل إدارة القواعد التجارية (Business Rules) في النظام. هذا النظام يجعل إضافة قواعد جديدة سهلاً جداً دون الحاجة لتعديل الكود في أماكن متعددة.

## المزايا الرئيسية

1. **قواعد موحدة**: جميع القواعد في مكان واحد (`employeeRules.js`)
2. **سهولة التوسع**: إضافة قواعد جديدة لا يتطلب سوى إضافة إدخال في ملف القواعد
3. **التعامل التلقائي**: الكود يتعامل مع جميع الحالات الخاصة تلقائياً
4. **عدم استخدام النصوص**: جميع فحوصات المهن تستخدم القواعد وليس النصوص المباشرة

## هيكل النظام

### 1. قواعد الجنسيات (Nationality Rules)

```javascript
NATIONALITY_RULES = {
  saudi: {
    variations: [...], // قائمة بجميع أشكال كتابة "سعودي"
    requirements: {
      idType: 'citizen',
      dateOfBirthCalendar: 'hijri',
      requiresPassport: false,
      // ...
    }
  },
  nonSaudi: {
    requirements: {
      idType: 'resident',
      dateOfBirthCalendar: 'gregorian',
      requiresPassport: true,
      // ...
    }
  }
}
```

**لإضافة جنسية جديدة:**

- أضف الاختلافات في `variations` إذا كانت سعودية
- أو أضف قواعد جديدة في `nonSaudi` إذا كانت غير سعودية

### 2. قواعد أنواع الفروع (Branch Type Rules)

```javascript
BRANCH_TYPE_RULES = {
  school: {
    label: 'مدرسة',
    requiredDocuments: [...],
    excludedDocuments: [...],
    employeeDocumentRequirements: {
      professionalLicense: true
    }
  },
  healthcare_center: {
    // ...
  }
}
```

**لإضافة نوع فرع جديد:**

1. أضف إدخال جديد في `BRANCH_TYPE_RULES`
2. حدد المستندات المطلوبة والمستبعدة
3. حدد متطلبات مستندات الموظفين

### 3. قواعد المهن (Job Title Rules)

```javascript
JOB_TITLE_RULES = {
  classification: {
    jobTitles: ['علاج طبيعي', 'علاج وظيفي', ...],
    requiredDocument: 'classification',
    branchType: 'healthcare_center'
  },
  experienceCertificate: {
    school: {
      jobTitles: ['مدير', 'وكيل'],
      requiredDocument: 'experience_certificate'
    },
    healthcare_center: {
      jobTitles: ['مديرة مراكز', 'مشرف فني عام'],
      requiredDocument: 'experience_certificate'
    }
  }
}
```

**لإضافة قاعدة مهنة جديدة:**

مثال: إضافة مهنة جديدة تحتاج إلى مستند خاص

```javascript
JOB_TITLE_RULES = {
  // ... القواعد الموجودة

  // إضافة قاعدة جديدة
  newDocument: {
    jobTitles: ["المهنة الجديدة"],
    requiredDocument: "new_document_type",
    branchType: "healthcare_center", // أو 'school' أو null للجميع
  },
};
```

**ملاحظة مهمة**: جميع فحوصات المهن يجب أن تستخدم `jobTitleMatchesRule()` وليس مقارنة نصية مباشرة.

### 4. قواعد أنواع المستندات (Document Type Rules)

```javascript
DOCUMENT_TYPE_RULES = {
  common: [...], // مستندات مشتركة للجميع
  nationality: {
    nonSaudi: ['passport']
  },
  branch: {
    school: [...],
    healthcare_center: [...]
  }
}
```

## كيفية الاستخدام

### في الكود

```javascript
import {
  isSaudiNationality,
  getNationalityRequirements,
  getBranchTypeRules,
  jobTitleMatchesRule,
  getRequiredDocumentsForJobTitle,
  getAllRequiredDocuments,
  validateDocumentType,
} from "../utils/employeeRules";

// التحقق من الجنسية
const isSaudi = isSaudiNationality(employee.nationality);

// الحصول على متطلبات الجنسية
const reqs = getNationalityRequirements(employee.nationality);

// التحقق من مهنة مقابل قاعدة
const needsClassification = jobTitleMatchesRule(
  employee.job_title,
  "classification",
  employee.branch_type
);

// الحصول على جميع المستندات المطلوبة
const requiredDocs = getAllRequiredDocuments(employee);

// التحقق من صحة نوع مستند
const validation = validateDocumentType("passport", employee);
if (!validation.allowed) {
  console.log(validation.reason);
}
```

### في employeeHelpers.js

يتم استخدام النظام الجديد تلقائياً. جميع الدوال القديمة تعمل بنفس الطريقة ولكنها تستخدم النظام الجديد داخلياً.

## أمثلة على إضافة قواعد جديدة

### مثال 1: إضافة مهنة جديدة تحتاج تصنيف

```javascript
// في employeeRules.js
JOB_TITLE_RULES.classification.jobTitles.push("المهنة الجديدة");
```

### مثال 2: إضافة نوع فرع جديد

```javascript
// في employeeRules.js
BRANCH_TYPE_RULES.new_branch_type = {
  label: "نوع فرع جديد",
  requiredDocuments: ["license", "registration"],
  excludedDocuments: [],
  employeeDocumentRequirements: {
    professionalLicense: false,
  },
};
```

### مثال 3: إضافة مستند مطلوب لجميع الموظفين

```javascript
// في employeeRules.js
DOCUMENT_TYPE_RULES.common.push("new_common_document");
```

## الملفات المحدثة

1. `react-app/src/utils/employeeRules.js` - نظام القواعد (Frontend)
2. `express-app/utils/employeeRules.js` - نظام القواعد (Backend)
3. `react-app/src/utils/employeeHelpers.js` - يستخدم النظام الجديد
4. `express-app/utils/employeeHelpers.js` - يستخدم النظام الجديد

## ملاحظات مهمة

1. **لا تستخدم مقارنات نصية مباشرة**: دائماً استخدم `jobTitleMatchesRule()` للتحقق من المهن
2. **جميع القواعد في مكان واحد**: لا تضيف قواعد في أماكن أخرى
3. **التوافق مع الكود القديم**: جميع الدوال القديمة تعمل بنفس الطريقة
4. **التوسع السهل**: لإضافة قاعدة جديدة، أضف إدخال في ملف القواعد فقط

## الفوائد

- ✅ سهولة الصيانة: جميع القواعد في مكان واحد
- ✅ سهولة التوسع: إضافة قواعد جديدة لا يتطلب تعديل الكود
- ✅ التوحيد: نفس القواعد في Frontend و Backend
- ✅ المرونة: يمكن إضافة أنواع فروع ومهن جديدة بسهولة
- ✅ الأمان: لا توجد مقارنات نصية مباشرة في الكود
