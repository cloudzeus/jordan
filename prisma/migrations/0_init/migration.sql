-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TaxTemplateStatus" AS ENUM ('DRAFT', 'READY');

-- CreateEnum
CREATE TYPE "TaxFieldKind" AS ENUM ('SINGLE', 'SERIES', 'TABLE');

-- CreateEnum
CREATE TYPE "FinancialValueType" AS ENUM ('CURRENCY', 'NUMBER', 'PERCENT', 'INTEGER', 'DATE', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "FinancialValueSource" AS ENUM ('OCR', 'MANUAL');

-- CreateEnum
CREATE TYPE "FinancialYearMode" AS ENUM ('REFERENCE', 'PRIOR_1', 'PRIOR_2', 'PRIOR_3');

-- CreateEnum
CREATE TYPE "RoleKey" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'COLLABORATOR', 'SUPPLIER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('EMAIL', 'GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('GEMI', 'MANUAL');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('DECISION', 'PUBLICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "KadLicenseType" AS ENUM ('OPERATING_LICENSE');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('EMAIL', 'PHONE', 'MOBILE', 'FAX', 'OTHER');

-- CreateEnum
CREATE TYPE "OcrDocType" AS ENUM ('INVOICE', 'RECEIPT', 'GENERAL_TEXT');

-- CreateEnum
CREATE TYPE "OcrPdfSource" AS ENUM ('DIGITAL', 'SCANNED');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OcrCategory" AS ENUM ('EXPENSE', 'INVOICE_IN', 'INVOICE_OUT', 'RECEIPT', 'CREDIT_NOTE', 'PAYROLL', 'TAX', 'OTHER');

-- CreateEnum
CREATE TYPE "OcrPostStatus" AS ENUM ('NONE', 'PENDING', 'POSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'REVIEWING', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgramExtractStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "KadEligibilityRule" AS ENUM ('ALL_EXCEPT_LISTED', 'ONLY_LISTED', 'MIXED', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "ProgramBonusKind" AS ENUM ('TIME_BASED', 'EMPLOYMENT', 'SUSTAINABILITY', 'WOMEN_LED', 'YOUTH', 'R_AND_D', 'OTHER');

-- CreateEnum
CREATE TYPE "ProgramFileKind" AS ENUM ('MAIN', 'ANNEX', 'CLARIFICATION', 'AMENDMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AiScope" AS ENUM ('OCR_TEXT', 'OCR_VISION', 'OCR_VISION_RETRY', 'TRANSLATION', 'TAX_FORM', 'OTHER');

-- CreateEnum
CREATE TYPE "QuestionnaireScoringModel" AS ENUM ('WEIGHTED', 'POINTS_SUM');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('DRAFT', 'READY');

-- CreateEnum
CREATE TYPE "QuestionAnswerType" AS ENUM ('BOOLEAN', 'SINGLE_CHOICE', 'NUMERIC', 'SCALE');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AssessmentVerdict" AS ENUM ('ELIGIBLE', 'NOT_ELIGIBLE', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "AnswerSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "TemplateMode" AS ENUM ('AUTO', 'SEMI_AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- CreateEnum
CREATE TYPE "TemplateFieldKind" AS ENUM ('SINGLE', 'TABLE');

-- CreateEnum
CREATE TYPE "TemplateValueType" AS ENUM ('TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'LIST');

-- CreateEnum
CREATE TYPE "MappingTarget" AS ENUM ('INVOICE', 'EXCEL');

-- CreateEnum
CREATE TYPE "TemplateRunStatus" AS ENUM ('EXTRACTED', 'REVIEW', 'BLOCKED', 'POSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "TemplateSampleStatus" AS ENUM ('PENDING', 'READ', 'VERIFIED');

-- CreateEnum
CREATE TYPE "TemplateJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TemplateJobItemStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "SoftoneOutboxStatus" AS ENUM ('PENDING', 'SENT', 'NEEDS_REVIEW', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" "RoleKey",
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "locale" TEXT NOT NULL DEFAULT 'el',
    "preferredLocales" TEXT[] DEFAULT ARRAY['el']::TEXT[],
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "OtpToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DbBackup" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "errorMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DbBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "isImage" BOOLEAN NOT NULL DEFAULT false,
    "isSvg" BOOLEAN NOT NULL DEFAULT false,
    "publicUrl" TEXT NOT NULL,
    "originalUrl" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pluralName" TEXT,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "sodtype" INTEGER,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "afm" TEXT,
    "doy" TEXT,
    "irsData" TEXT,
    "profession" TEXT,
    "legalForm" TEXT,
    "gemhNumber" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "country" TEXT DEFAULT 'GR',
    "district" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "website" TEXT,
    "contactPerson" TEXT,
    "contactTitle" TEXT,
    "iban" TEXT,
    "bankName" TEXT,
    "currency" TEXT DEFAULT 'EUR',
    "paymentTerms" TEXT,
    "creditLimit" DECIMAL(14,2),
    "balance" DECIMAL(14,2),
    "discount" DECIMAL(5,2),
    "vatCategory" TEXT,
    "category" TEXT,
    "branchInfo" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "foundingDate" TIMESTAMP(3),
    "aadeStatus" TEXT,
    "aadeFirmKind" TEXT,
    "aadeSyncedAt" TIMESTAMP(3),
    "logoUrl" TEXT,
    "logoStorageKey" TEXT,
    "arGemi" TEXT,
    "gemiOffice" TEXT,
    "gemiStatus" TEXT,
    "gemiObjective" TEXT,
    "gemiIsBranch" BOOLEAN,
    "gemiAutoRegistered" BOOLEAN,
    "gemiLastStatusChange" TIMESTAMP(3),
    "gemiSyncedAt" TIMESTAMP(3),
    "gemiData" JSONB,
    "s1Trdr" INTEGER,
    "s1UpdDate" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocodedAt" TIMESTAMP(3),
    "geocodedAddress" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legalTypeId" INTEGER,
    "businessTypeId" TEXT,
    "businessTypeOverride" BOOLEAN NOT NULL DEFAULT false,
    "gemiOfficeId" INTEGER,
    "companyStatusId" INTEGER,
    "prefectureId" TEXT,
    "municipalityId" TEXT,
    "regionCode" TEXT,
    "vatCategoryId" INTEGER,
    "employeeCount" INTEGER,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalType" (
    "id" INTEGER NOT NULL,
    "descr" TEXT NOT NULL,
    "descrEn" TEXT,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "LegalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GemiOfficeRef" (
    "id" INTEGER NOT NULL,
    "descr" TEXT NOT NULL,
    "descrEn" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "fax" TEXT,
    "url" TEXT,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "GemiOfficeRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyStatusRef" (
    "id" INTEGER NOT NULL,
    "descr" TEXT NOT NULL,
    "descrEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "CompanyStatusRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prefecture" (
    "id" TEXT NOT NULL,
    "descr" TEXT NOT NULL,
    "descrEn" TEXT,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "Prefecture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatCategory" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "descr" TEXT NOT NULL,
    "rate" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VatCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseDocType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "abbrev" TEXT,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "postObject" TEXT,
    "postLines" TEXT,

    CONSTRAINT "PurchaseDocType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneDocSeries" (
    "id" SERIAL NOT NULL,
    "sosource" INTEGER NOT NULL,
    "family" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "abbrev" TEXT,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "postObject" TEXT,
    "postLines" TEXT,

    CONSTRAINT "SoftoneDocSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneTrader" (
    "id" SERIAL NOT NULL,
    "trdr" INTEGER NOT NULL,
    "sodtype" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "afm" TEXT,
    "doy" TEXT,
    "profession" TEXT,
    "address" TEXT,
    "district" TEXT,
    "zip" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "webpage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SoftoneTrader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneItem" (
    "id" SERIAL NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "code1" TEXT,
    "code2" TEXT,
    "name" TEXT NOT NULL,
    "name2" TEXT,
    "price" DOUBLE PRECISION,
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "myDataCode" TEXT,
    "unit1" TEXT,
    "unitBuy" TEXT,
    "buyRatio" DOUBLE PRECISION,
    "unitSell" TEXT,
    "sellRatio" DOUBLE PRECISION,

    CONSTRAINT "SoftoneItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneLookup" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SoftoneLookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "prefectureId" TEXT,
    "descr" TEXT NOT NULL,
    "descrEn" TEXT,
    "lastUpdated" TIMESTAMP(3),

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "code" TEXT NOT NULL,
    "nameEL" TEXT NOT NULL,
    "nameEN" TEXT,
    "level" INTEGER NOT NULL,
    "parentCode" TEXT,
    "path" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CompanyDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "DocumentSource" NOT NULL DEFAULT 'GEMI',
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "kak" TEXT,
    "assembly" TEXT,
    "summary" TEXT,
    "decisionSubject" TEXT,
    "dateAssemblyDecided" TIMESTAMP(3),
    "dateAnnounced" TIMESTAMP(3),
    "dateRegistrated" TIMESTAMP(3),
    "applicationStatus" TEXT,
    "sourceUrl" TEXT,
    "storageKey" TEXT,
    "publicUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KadCode" (
    "code" TEXT NOT NULL,
    "codeWithoutDots" VARCHAR(10),
    "description" TEXT NOT NULL,
    "title" TEXT,
    "level" INTEGER,
    "sector" VARCHAR(3),
    "sectorLetter" VARCHAR(3),
    "parentCode" TEXT,
    "path" TEXT,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KadCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CustomerKAD" (
    "id" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "submittedKAD" VARCHAR(20) NOT NULL,
    "resolvedKAD" VARCHAR(20),
    "hierarchyJSON" JSONB,
    "status" TEXT NOT NULL DEFAULT 'resolved',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerKAD_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KadLicenseRequirement" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "licenseType" "KadLicenseType" NOT NULL DEFAULT 'OPERATING_LICENSE',
    "inherited" BOOLEAN NOT NULL DEFAULT false,
    "sourceParentCode" VARCHAR(20),
    "source" TEXT NOT NULL DEFAULT 'NF BUSNESS',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KadLicenseRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KadImportLog" (
    "id" SERIAL NOT NULL,
    "totalCodes" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceVersion" TEXT NOT NULL DEFAULT '2026',
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,

    CONSTRAINT "KadImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeWithoutDots" TEXT,
    "codeAade" TEXT,
    "description" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL DEFAULT 'SECONDARY',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyChannel" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "ChannelKind" NOT NULL,
    "label" TEXT,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT NOT NULL,
    "role" TEXT,
    "department" TEXT,
    "mobile" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "fax" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "country" TEXT DEFAULT 'GR',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "avatarUrl" TEXT,
    "avatarStorageKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyBranch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "s1Branch" INTEGER,
    "name" TEXT NOT NULL,
    "isHeadquarters" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "country" TEXT DEFAULT 'GR',
    "district" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "fax" TEXT,
    "email" TEXT,
    "contactPerson" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocodedAt" TIMESTAMP(3),
    "regionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyTypeAssignment" (
    "companyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyTypeAssignment_pkey" PRIMARY KEY ("companyId","typeId")
);

-- CreateTable
CREATE TABLE "ExcelImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mappedFields" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ExcelImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrDocument" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "docType" "OcrDocType" NOT NULL,
    "pdfSource" "OcrPdfSource",
    "language" TEXT NOT NULL DEFAULT 'el',
    "status" "OcrStatus" NOT NULL DEFAULT 'PENDING',
    "rawText" TEXT,
    "extractedData" JSONB,
    "document" JSONB,
    "errorMessage" TEXT,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "durationMs" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "thumbKey" TEXT,
    "thumbUrl" TEXT,
    "category" "OcrCategory",
    "notes" TEXT,
    "postStatus" "OcrPostStatus" NOT NULL DEFAULT 'NONE',
    "postedAt" TIMESTAMP(3),
    "postedRef" TEXT,
    "postError" TEXT,
    "issuerAfm" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "softoneTrdr" INTEGER,
    "softoneCode" TEXT,
    "softoneName" TEXT,
    "softoneKind" TEXT,
    "softoneChecked" TIMESTAMP(3),
    "invoiceKind" TEXT,
    "softoneDocExists" BOOLEAN,
    "softoneDocRef" TEXT,
    "softoneDocChecked" TIMESTAMP(3),
    "reconOverride" TEXT,
    "itemsTotal" INTEGER,
    "itemsMatched" INTEGER,
    "softoneSeries" TEXT,
    "seriesSource" INTEGER,
    "seriesConfidence" DOUBLE PRECISION,
    "seriesReason" TEXT,
    "seriesBy" TEXT,
    "batchId" TEXT,
    "companyId" TEXT,
    "taxTemplateId" TEXT,
    "reviewFlags" JSONB,
    "fiscalYear" INTEGER,

    CONSTRAINT "OcrDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "docType" "OcrDocType" NOT NULL DEFAULT 'INVOICE',
    "language" TEXT NOT NULL DEFAULT 'el',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceKey" TEXT,
    "sourceName" TEXT,
    "sourcePages" INTEGER,

    CONSTRAINT "OcrBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "sourceFileName" TEXT,
    "storageKey" TEXT,
    "publicUrl" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "publicationDate" TIMESTAMP(3),
    "submissionStart" TIMESTAMP(3),
    "submissionEnd" TIMESTAMP(3),
    "totalBudget" DECIMAL(18,2),
    "fundingRate" DECIMAL(5,2),
    "durationMonths" INTEGER,
    "referenceCode" TEXT,
    "kadRule" "KadEligibilityRule" NOT NULL DEFAULT 'UNSPECIFIED',
    "kadRuleNote" TEXT,
    "minEmployeesFte" DECIMAL(10,2),
    "minOperationalYears" DECIMAL(5,2),
    "eligibilityNote" TEXT,
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "extractStatus" "ProgramExtractStatus" NOT NULL DEFAULT 'PENDING',
    "extractedData" JSONB,
    "errorMessage" TEXT,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "durationMs" INTEGER,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramKad" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeWithoutDots" TEXT,
    "description" TEXT,
    "excluded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProgramKad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramExpenseCategory" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minAmount" DECIMAL(18,2),
    "minPercentage" DECIMAL(5,2),
    "maxAmount" DECIMAL(18,2),
    "maxPercentage" DECIMAL(5,2),
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramBonus" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "kind" "ProgramBonusKind" NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "bonusRate" DECIMAL(5,2),
    "bonusAmount" DECIMAL(18,2),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramFile" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" "ProgramFileKind" NOT NULL DEFAULT 'OTHER',
    "label" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "ProgramFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramEligibleLegalForm" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ProgramEligibleLegalForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRegion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fundingRate" DECIMAL(5,2),
    "notes" TEXT,

    CONSTRAINT "ProgramRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramCriterion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDeadline" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "requiresExpiry" BOOLEAN NOT NULL DEFAULT true,
    "notifyExpiry" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramPhase" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phaseTemplateId" TEXT,

    CONSTRAINT "ProgramPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseDocumentRequirement" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "documentTypeId" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PhaseDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhaseTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhaseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementBusinessType" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "businessTypeId" TEXT NOT NULL,

    CONSTRAINT "RequirementBusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "scope" "AiScope" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "inputCost" DECIMAL(12,6),
    "outputCost" DECIMAL(12,6),
    "totalCost" DECIMAL(12,6),
    "durationMs" INTEGER,
    "userId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrInvoiceItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "price" DECIMAL(18,4),
    "discount" DECIMAL(18,4),
    "vatRate" DECIMAL(5,2),
    "total" DECIMAL(18,4),
    "softoneMtrl" INTEGER,
    "softoneCode" TEXT,
    "softoneName" TEXT,
    "softoneIsService" BOOLEAN,
    "softoneMatchedBy" TEXT,
    "softoneExpn" INTEGER,
    "softoneLinMtrl" INTEGER,
    "softoneAsset" INTEGER,
    "softoneCostCntr" INTEGER,
    "softonePrjc" INTEGER,
    "softonePrjcStage" INTEGER,

    CONSTRAINT "OcrInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrInvoiceItemAllocation" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "registryMtrl" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LINEITEM',
    "accountCode" TEXT,
    "percent" DECIMAL(7,4) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrInvoiceItemAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxFormTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "description" TEXT,
    "status" "TaxTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "sampleStorageKey" TEXT,
    "samplePageCount" INTEGER,
    "sampleThumbUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxFormTemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "section" TEXT,
    "valueType" "FinancialValueType" NOT NULL DEFAULT 'CURRENCY',
    "kind" "TaxFieldKind" NOT NULL DEFAULT 'SINGLE',
    "config" JSONB,
    "regionHint" JSONB,
    "aiHint" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFormTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyFinancialValue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "templateId" TEXT,
    "year" INTEGER NOT NULL,
    "value" DECIMAL(18,2),
    "valueText" TEXT,
    "valueJson" JSONB,
    "kind" "TaxFieldKind" NOT NULL DEFAULT 'SINGLE',
    "valueType" "FinancialValueType" NOT NULL,
    "source" "FinancialValueSource" NOT NULL DEFAULT 'OCR',
    "sourceDocumentId" TEXT,
    "confidence" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFinancialValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramRequiredField" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "yearsBack" INTEGER NOT NULL DEFAULT 1,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramRequiredField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramQuestionnaire" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "scoringModel" "QuestionnaireScoringModel" NOT NULL DEFAULT 'WEIGHTED',
    "threshold" DECIMAL(8,2),
    "maxScore" DECIMAL(8,2),
    "sourceNote" TEXT,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedModel" TEXT,
    "generatedAt" TIMESTAMP(3),
    "computedCriteria" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramQuestionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramQuestion" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "code" TEXT,
    "text" TEXT NOT NULL,
    "criterionRef" TEXT,
    "helpText" TEXT,
    "answerType" "QuestionAnswerType" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "weight" DECIMAL(8,2),
    "maxPoints" DECIMAL(8,2),
    "companyField" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProgramQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAssessment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "questionnaireId" TEXT,
    "eligible" BOOLEAN,
    "eligibilityResult" JSONB,
    "questionnaireScore" DECIMAL(8,2),
    "questionnaireMax" DECIMAL(8,2),
    "questionnairePassed" BOOLEAN,
    "overallVerdict" "AssessmentVerdict" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAnswer" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "valueBool" BOOLEAN,
    "valueNumber" DECIMAL(14,4),
    "valueText" TEXT,
    "selectedOptionId" TEXT,
    "pointsAwarded" DECIMAL(8,2),
    "source" "AnswerSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "AssessmentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "department" TEXT,
    "vatNumber" TEXT,
    "traderTrdr" INTEGER,
    "supplierName" TEXT,
    "mode" "TemplateMode" NOT NULL DEFAULT 'MANUAL',
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "sampleStorageKey" TEXT,
    "sampleMimeType" TEXT,
    "samplePageCount" INTEGER,
    "sampleThumbUrl" TEXT,
    "fingerprint" JSONB,
    "minTrainingScore" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "minTrainingSamples" INTEGER NOT NULL DEFAULT 3,
    "trainingScore" DOUBLE PRECISION,
    "verifiedSamples" INTEGER NOT NULL DEFAULT 0,
    "notifyEmails" TEXT,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "TemplateFieldKind" NOT NULL DEFAULT 'SINGLE',
    "valueType" "TemplateValueType" NOT NULL DEFAULT 'TEXT',
    "color" TEXT NOT NULL,
    "region" JSONB,
    "columns" JSONB,
    "aiHint" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "lastGood" JSONB,

    CONSTRAINT "TemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateMapping" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "target" "MappingTarget" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "rows" JSONB NOT NULL,

    CONSTRAINT "TemplateMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateCondition" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "logic" TEXT NOT NULL DEFAULT 'AND',
    "clauses" JSONB NOT NULL,
    "actions" JSONB NOT NULL,

    CONSTRAINT "TemplateCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRun" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "TemplateRunStatus" NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'upload',
    "error" TEXT,
    "values" JSONB NOT NULL,
    "output" JSONB,
    "matched" JSONB NOT NULL,
    "flags" JSONB,
    "mappingName" TEXT NOT NULL,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSample" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "pageCount" INTEGER,
    "status" "TemplateSampleStatus" NOT NULL DEFAULT 'PENDING',
    "expected" JSONB,
    "lastResult" JSONB,
    "score" DOUBLE PRECISION,
    "fingerprint" JSONB,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateJob" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" "TemplateJobStatus" NOT NULL DEFAULT 'QUEUED',
    "title" TEXT,
    "reference" TEXT,
    "docDate" TIMESTAMP(3),
    "description" TEXT,
    "notifyEmails" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TemplateJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "TemplateJobItemStatus" NOT NULL DEFAULT 'QUEUED',
    "page" INTEGER,
    "values" JSONB,
    "matched" JSONB,
    "flags" JSONB,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TemplateJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneExpense" (
    "id" SERIAL NOT NULL,
    "expn" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vat" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classType" INTEGER,
    "classTypeX" INTEGER,
    "classCategory" INTEGER,
    "classCategoryX" INTEGER,
    "myDataVprc" INTEGER,

    CONSTRAINT "SoftoneExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneLineItem" (
    "id" SERIAL NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vat" TEXT,
    "mtrType" INTEGER,
    "mtrCategory" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classType" INTEGER,
    "classCategory" INTEGER,
    "myDataCode" TEXT,
    "myDataVprc" INTEGER,
    "acnmsk" TEXT,
    "acnmskSyncedAt" TIMESTAMP(3),

    CONSTRAINT "SoftoneLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneAccount" (
    "id" SERIAL NOT NULL,
    "acnt" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grade" INTEGER,
    "parentCode" TEXT,
    "sodtype" INTEGER,
    "postable" BOOLEAN,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneSxAccount" (
    "id" SERIAL NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mtrType" INTEGER,
    "soClmns" INTEGER,
    "vat" TEXT,
    "myDataCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneSxAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneLineCategory" (
    "id" SERIAL NOT NULL,
    "mtrCategory" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vat" TEXT,
    "acnmsk" TEXT,
    "sodtypeFiltered" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneLineCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneCostCenter" (
    "id" SERIAL NOT NULL,
    "costcntr" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name2" TEXT,
    "sohCode" TEXT,
    "acnmsk" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneCostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneProject" (
    "id" SERIAL NOT NULL,
    "prjc" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trdr" INTEGER,
    "prjType" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneProjectStage" (
    "id" SERIAL NOT NULL,
    "prjcStage" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneProjectStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneMyDataClassType" (
    "id" SERIAL NOT NULL,
    "sotype" INTEGER NOT NULL,
    "code" INTEGER NOT NULL,
    "myDataCode" TEXT,
    "sohCode" TEXT,
    "name" TEXT NOT NULL,
    "isVat" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneMyDataClassType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneMyDataClassCategory" (
    "id" SERIAL NOT NULL,
    "sotype" INTEGER NOT NULL,
    "code" INTEGER NOT NULL,
    "myDataCode" TEXT,
    "sohCode" TEXT,
    "name" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneMyDataClassCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationShapeRule" (
    "id" TEXT NOT NULL,
    "afm" TEXT NOT NULL DEFAULT '',
    "pattern" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LINEITEM',
    "parts" JSONB NOT NULL,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllocationShapeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineMatchRule" (
    "id" TEXT NOT NULL,
    "afm" TEXT NOT NULL DEFAULT '',
    "pattern" TEXT NOT NULL,
    "mtrl" INTEGER,
    "expn" INTEGER,
    "lin" INTEGER,
    "costCntr" INTEGER,
    "prjc" INTEGER,
    "prjcStage" INTEGER,
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "targetSource" TEXT,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineMatchRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgnoredIssuer" (
    "afm" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgnoredIssuer_pkey" PRIMARY KEY ("afm")
);

-- CreateTable
CREATE TABLE "GeocodeCache" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "countryHint" TEXT,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" TEXT,
    "country" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "formatted" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneOutbox" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "SoftoneOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "result" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "SoftoneOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneMirrorState" (
    "table" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "rows" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SoftoneMirrorState_pkey" PRIMARY KEY ("table")
);

-- CreateTable
CREATE TABLE "SoftoneConnectionEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "tenantKey" TEXT,
    "prevTenantKey" TEXT,
    "detail" JSONB,

    CONSTRAINT "SoftoneConnectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingAnswer" (
    "id" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comment" TEXT,
    "answeredBy" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegratorItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'mid',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'accountant',
    "questionKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "IntegratorItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftoneAsset" (
    "id" SERIAL NOT NULL,
    "mtrl" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vat" TEXT,
    "mtrAcn" INTEGER,
    "mtrCategory" INTEGER,
    "acnmsk" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftoneAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatCheck" (
    "id" TEXT NOT NULL,
    "vat" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "valid" BOOLEAN,
    "name" TEXT,
    "address" TEXT,
    "provider" TEXT,
    "source" TEXT,
    "consultationNumber" TEXT,
    "requester" TEXT,
    "match" JSONB,
    "error" TEXT,
    "message" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VatCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Role_order_idx" ON "Role"("order");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Permission_resource_order_idx" ON "Permission"("resource", "order");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE INDEX "AppSetting_category_idx" ON "AppSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "DbBackup_storageKey_key" ON "DbBackup"("storageKey");

-- CreateIndex
CREATE INDEX "DbBackup_createdAt_idx" ON "DbBackup"("createdAt");

-- CreateIndex
CREATE INDEX "MediaFolder_parentId_idx" ON "MediaFolder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFolder_parentId_name_key" ON "MediaFolder"("parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFile_storageKey_key" ON "MediaFile"("storageKey");

-- CreateIndex
CREATE INDEX "MediaFile_folderId_idx" ON "MediaFile"("folderId");

-- CreateIndex
CREATE INDEX "MediaFile_uploadedAt_idx" ON "MediaFile"("uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyType_key_key" ON "CompanyType"("key");

-- CreateIndex
CREATE INDEX "CompanyType_order_idx" ON "CompanyType"("order");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Company_afm_key" ON "Company"("afm");

-- CreateIndex
CREATE UNIQUE INDEX "Company_arGemi_key" ON "Company"("arGemi");

-- CreateIndex
CREATE UNIQUE INDEX "Company_s1Trdr_key" ON "Company"("s1Trdr");

-- CreateIndex
CREATE INDEX "Company_legalTypeId_idx" ON "Company"("legalTypeId");

-- CreateIndex
CREATE INDEX "Company_businessTypeId_idx" ON "Company"("businessTypeId");

-- CreateIndex
CREATE INDEX "Company_gemiOfficeId_idx" ON "Company"("gemiOfficeId");

-- CreateIndex
CREATE INDEX "Company_companyStatusId_idx" ON "Company"("companyStatusId");

-- CreateIndex
CREATE INDEX "Company_prefectureId_idx" ON "Company"("prefectureId");

-- CreateIndex
CREATE INDEX "Company_municipalityId_idx" ON "Company"("municipalityId");

-- CreateIndex
CREATE INDEX "Company_regionCode_idx" ON "Company"("regionCode");

-- CreateIndex
CREATE INDEX "Company_vatCategoryId_idx" ON "Company"("vatCategoryId");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_afm_idx" ON "Company"("afm");

-- CreateIndex
CREATE INDEX "Company_isActive_idx" ON "Company"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VatCategory_code_key" ON "VatCategory"("code");

-- CreateIndex
CREATE INDEX "VatCategory_order_idx" ON "VatCategory"("order");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseDocType_code_key" ON "PurchaseDocType"("code");

-- CreateIndex
CREATE INDEX "PurchaseDocType_order_idx" ON "PurchaseDocType"("order");

-- CreateIndex
CREATE INDEX "SoftoneDocSeries_sosource_idx" ON "SoftoneDocSeries"("sosource");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneDocSeries_sosource_code_key" ON "SoftoneDocSeries"("sosource", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneTrader_trdr_key" ON "SoftoneTrader"("trdr");

-- CreateIndex
CREATE INDEX "SoftoneTrader_sodtype_idx" ON "SoftoneTrader"("sodtype");

-- CreateIndex
CREATE INDEX "SoftoneTrader_name_idx" ON "SoftoneTrader"("name");

-- CreateIndex
CREATE INDEX "SoftoneTrader_code_idx" ON "SoftoneTrader"("code");

-- CreateIndex
CREATE INDEX "SoftoneTrader_afm_idx" ON "SoftoneTrader"("afm");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneItem_mtrl_key" ON "SoftoneItem"("mtrl");

-- CreateIndex
CREATE INDEX "SoftoneItem_name_idx" ON "SoftoneItem"("name");

-- CreateIndex
CREATE INDEX "SoftoneItem_code_idx" ON "SoftoneItem"("code");

-- CreateIndex
CREATE INDEX "SoftoneItem_code1_idx" ON "SoftoneItem"("code1");

-- CreateIndex
CREATE INDEX "SoftoneItem_code2_idx" ON "SoftoneItem"("code2");

-- CreateIndex
CREATE INDEX "SoftoneItem_isService_idx" ON "SoftoneItem"("isService");

-- CreateIndex
CREATE INDEX "SoftoneLookup_kind_idx" ON "SoftoneLookup"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneLookup_kind_code_key" ON "SoftoneLookup"("kind", "code");

-- CreateIndex
CREATE INDEX "Municipality_prefectureId_idx" ON "Municipality"("prefectureId");

-- CreateIndex
CREATE INDEX "Municipality_descr_idx" ON "Municipality"("descr");

-- CreateIndex
CREATE INDEX "Region_parentCode_idx" ON "Region"("parentCode");

-- CreateIndex
CREATE INDEX "Region_level_idx" ON "Region"("level");

-- CreateIndex
CREATE INDEX "Region_nameEL_idx" ON "Region"("nameEL");

-- CreateIndex
CREATE INDEX "CompanyDocument_companyId_idx" ON "CompanyDocument"("companyId");

-- CreateIndex
CREATE INDEX "CompanyDocument_kak_idx" ON "CompanyDocument"("kak");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDocument_companyId_kak_key" ON "CompanyDocument"("companyId", "kak");

-- CreateIndex
CREATE UNIQUE INDEX "KadCode_codeWithoutDots_key" ON "KadCode"("codeWithoutDots");

-- CreateIndex
CREATE INDEX "KadCode_title_idx" ON "KadCode"("title");

-- CreateIndex
CREATE INDEX "KadCode_description_idx" ON "KadCode"("description");

-- CreateIndex
CREATE INDEX "KadCode_parentCode_idx" ON "KadCode"("parentCode");

-- CreateIndex
CREATE INDEX "KadCode_level_idx" ON "KadCode"("level");

-- CreateIndex
CREATE INDEX "KadCode_sectorLetter_idx" ON "KadCode"("sectorLetter");

-- CreateIndex
CREATE INDEX "KadCode_codeWithoutDots_idx" ON "KadCode"("codeWithoutDots");

-- CreateIndex
CREATE INDEX "CustomerKAD_customerId_idx" ON "CustomerKAD"("customerId");

-- CreateIndex
CREATE INDEX "CustomerKAD_submittedKAD_idx" ON "CustomerKAD"("submittedKAD");

-- CreateIndex
CREATE INDEX "CustomerKAD_resolvedKAD_idx" ON "CustomerKAD"("resolvedKAD");

-- CreateIndex
CREATE INDEX "KadLicenseRequirement_licenseType_idx" ON "KadLicenseRequirement"("licenseType");

-- CreateIndex
CREATE INDEX "KadLicenseRequirement_inherited_idx" ON "KadLicenseRequirement"("inherited");

-- CreateIndex
CREATE INDEX "KadLicenseRequirement_sourceParentCode_idx" ON "KadLicenseRequirement"("sourceParentCode");

-- CreateIndex
CREATE UNIQUE INDEX "KadLicenseRequirement_code_licenseType_key" ON "KadLicenseRequirement"("code", "licenseType");

-- CreateIndex
CREATE INDEX "CompanyActivity_companyId_idx" ON "CompanyActivity"("companyId");

-- CreateIndex
CREATE INDEX "CompanyActivity_codeWithoutDots_idx" ON "CompanyActivity"("codeWithoutDots");

-- CreateIndex
CREATE INDEX "CompanyActivity_codeAade_idx" ON "CompanyActivity"("codeAade");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyActivity_companyId_code_key" ON "CompanyActivity"("companyId", "code");

-- CreateIndex
CREATE INDEX "CompanyChannel_companyId_kind_idx" ON "CompanyChannel"("companyId", "kind");

-- CreateIndex
CREATE INDEX "CompanyChannel_value_idx" ON "CompanyChannel"("value");

-- CreateIndex
CREATE INDEX "CompanyContact_companyId_idx" ON "CompanyContact"("companyId");

-- CreateIndex
CREATE INDEX "CompanyContact_email_idx" ON "CompanyContact"("email");

-- CreateIndex
CREATE INDEX "CompanyContact_mobile_idx" ON "CompanyContact"("mobile");

-- CreateIndex
CREATE INDEX "CompanyBranch_companyId_idx" ON "CompanyBranch"("companyId");

-- CreateIndex
CREATE INDEX "CompanyBranch_regionCode_idx" ON "CompanyBranch"("regionCode");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBranch_companyId_code_key" ON "CompanyBranch"("companyId", "code");

-- CreateIndex
CREATE INDEX "CompanyTypeAssignment_typeId_idx" ON "CompanyTypeAssignment"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "OcrDocument_storageKey_key" ON "OcrDocument"("storageKey");

-- CreateIndex
CREATE INDEX "OcrDocument_status_idx" ON "OcrDocument"("status");

-- CreateIndex
CREATE INDEX "OcrDocument_docType_idx" ON "OcrDocument"("docType");

-- CreateIndex
CREATE INDEX "OcrDocument_category_idx" ON "OcrDocument"("category");

-- CreateIndex
CREATE INDEX "OcrDocument_postStatus_idx" ON "OcrDocument"("postStatus");

-- CreateIndex
CREATE INDEX "OcrDocument_createdAt_idx" ON "OcrDocument"("createdAt");

-- CreateIndex
CREATE INDEX "OcrDocument_batchId_idx" ON "OcrDocument"("batchId");

-- CreateIndex
CREATE INDEX "OcrDocument_companyId_idx" ON "OcrDocument"("companyId");

-- CreateIndex
CREATE INDEX "OcrDocument_issuerAfm_idx" ON "OcrDocument"("issuerAfm");

-- CreateIndex
CREATE INDEX "OcrDocument_issuerAfm_verifiedAt_idx" ON "OcrDocument"("issuerAfm", "verifiedAt");

-- CreateIndex
CREATE INDEX "OcrBatch_createdAt_idx" ON "OcrBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Program_storageKey_key" ON "Program"("storageKey");

-- CreateIndex
CREATE INDEX "Program_status_idx" ON "Program"("status");

-- CreateIndex
CREATE INDEX "Program_extractStatus_idx" ON "Program"("extractStatus");

-- CreateIndex
CREATE INDEX "Program_submissionEnd_idx" ON "Program"("submissionEnd");

-- CreateIndex
CREATE INDEX "Program_createdAt_idx" ON "Program"("createdAt");

-- CreateIndex
CREATE INDEX "ProgramKad_programId_idx" ON "ProgramKad"("programId");

-- CreateIndex
CREATE INDEX "ProgramKad_code_idx" ON "ProgramKad"("code");

-- CreateIndex
CREATE INDEX "ProgramKad_excluded_idx" ON "ProgramKad"("excluded");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramKad_programId_code_key" ON "ProgramKad"("programId", "code");

-- CreateIndex
CREATE INDEX "ProgramExpenseCategory_programId_idx" ON "ProgramExpenseCategory"("programId");

-- CreateIndex
CREATE INDEX "ProgramExpenseCategory_mandatory_idx" ON "ProgramExpenseCategory"("mandatory");

-- CreateIndex
CREATE INDEX "ProgramBonus_programId_idx" ON "ProgramBonus"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramFile_storageKey_key" ON "ProgramFile"("storageKey");

-- CreateIndex
CREATE INDEX "ProgramFile_programId_idx" ON "ProgramFile"("programId");

-- CreateIndex
CREATE INDEX "ProgramFile_kind_idx" ON "ProgramFile"("kind");

-- CreateIndex
CREATE INDEX "ProgramEligibleLegalForm_programId_idx" ON "ProgramEligibleLegalForm"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEligibleLegalForm_programId_name_key" ON "ProgramEligibleLegalForm"("programId", "name");

-- CreateIndex
CREATE INDEX "ProgramRegion_programId_idx" ON "ProgramRegion"("programId");

-- CreateIndex
CREATE INDEX "ProgramCriterion_programId_idx" ON "ProgramCriterion"("programId");

-- CreateIndex
CREATE INDEX "ProgramDeadline_programId_idx" ON "ProgramDeadline"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_name_key" ON "DocumentType"("name");

-- CreateIndex
CREATE INDEX "DocumentType_active_idx" ON "DocumentType"("active");

-- CreateIndex
CREATE INDEX "DocumentType_categoryId_idx" ON "DocumentType"("categoryId");

-- CreateIndex
CREATE INDEX "ProgramPhase_programId_idx" ON "ProgramPhase"("programId");

-- CreateIndex
CREATE INDEX "PhaseDocumentRequirement_phaseId_idx" ON "PhaseDocumentRequirement"("phaseId");

-- CreateIndex
CREATE INDEX "PhaseDocumentRequirement_documentTypeId_idx" ON "PhaseDocumentRequirement"("documentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseDocumentRequirement_phaseId_documentTypeId_key" ON "PhaseDocumentRequirement"("phaseId", "documentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessType_code_key" ON "BusinessType"("code");

-- CreateIndex
CREATE INDEX "BusinessType_active_idx" ON "BusinessType"("active");

-- CreateIndex
CREATE INDEX "BusinessType_order_idx" ON "BusinessType"("order");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCategory_name_key" ON "DocumentCategory"("name");

-- CreateIndex
CREATE INDEX "DocumentCategory_active_idx" ON "DocumentCategory"("active");

-- CreateIndex
CREATE UNIQUE INDEX "PhaseTemplate_name_key" ON "PhaseTemplate"("name");

-- CreateIndex
CREATE INDEX "PhaseTemplate_active_idx" ON "PhaseTemplate"("active");

-- CreateIndex
CREATE INDEX "PhaseTemplate_order_idx" ON "PhaseTemplate"("order");

-- CreateIndex
CREATE INDEX "RequirementBusinessType_requirementId_idx" ON "RequirementBusinessType"("requirementId");

-- CreateIndex
CREATE INDEX "RequirementBusinessType_businessTypeId_idx" ON "RequirementBusinessType"("businessTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementBusinessType_requirementId_businessTypeId_key" ON "RequirementBusinessType"("requirementId", "businessTypeId");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_scope_idx" ON "AiUsage"("scope");

-- CreateIndex
CREATE INDEX "AiUsage_model_idx" ON "AiUsage"("model");

-- CreateIndex
CREATE INDEX "AiUsage_userId_idx" ON "AiUsage"("userId");

-- CreateIndex
CREATE INDEX "OcrInvoiceItem_documentId_idx" ON "OcrInvoiceItem"("documentId");

-- CreateIndex
CREATE INDEX "OcrInvoiceItem_softoneMtrl_idx" ON "OcrInvoiceItem"("softoneMtrl");

-- CreateIndex
CREATE INDEX "OcrInvoiceItem_softoneExpn_idx" ON "OcrInvoiceItem"("softoneExpn");

-- CreateIndex
CREATE INDEX "OcrInvoiceItem_softoneLinMtrl_idx" ON "OcrInvoiceItem"("softoneLinMtrl");

-- CreateIndex
CREATE INDEX "OcrInvoiceItem_softoneAsset_idx" ON "OcrInvoiceItem"("softoneAsset");

-- CreateIndex
CREATE INDEX "OcrInvoiceItemAllocation_itemId_idx" ON "OcrInvoiceItemAllocation"("itemId");

-- CreateIndex
CREATE INDEX "OcrInvoiceItemAllocation_registryMtrl_idx" ON "OcrInvoiceItemAllocation"("registryMtrl");

-- CreateIndex
CREATE UNIQUE INDEX "OcrInvoiceItemAllocation_itemId_order_key" ON "OcrInvoiceItemAllocation"("itemId", "order");

-- CreateIndex
CREATE INDEX "TaxFormTemplate_status_idx" ON "TaxFormTemplate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TaxFormTemplate_code_year_key" ON "TaxFormTemplate"("code", "year");

-- CreateIndex
CREATE INDEX "TaxFormTemplateField_templateId_idx" ON "TaxFormTemplateField"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxFormTemplateField_templateId_fieldKey_key" ON "TaxFormTemplateField"("templateId", "fieldKey");

-- CreateIndex
CREATE INDEX "CompanyFinancialValue_companyId_idx" ON "CompanyFinancialValue"("companyId");

-- CreateIndex
CREATE INDEX "CompanyFinancialValue_fieldKey_year_idx" ON "CompanyFinancialValue"("fieldKey", "year");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFinancialValue_companyId_fieldKey_year_key" ON "CompanyFinancialValue"("companyId", "fieldKey", "year");

-- CreateIndex
CREATE INDEX "ProgramRequiredField_programId_idx" ON "ProgramRequiredField"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramRequiredField_programId_templateId_fieldKey_key" ON "ProgramRequiredField"("programId", "templateId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramQuestionnaire_programId_key" ON "ProgramQuestionnaire"("programId");

-- CreateIndex
CREATE INDEX "ProgramQuestion_questionnaireId_idx" ON "ProgramQuestion"("questionnaireId");

-- CreateIndex
CREATE INDEX "ProgramQuestionOption_questionId_idx" ON "ProgramQuestionOption"("questionId");

-- CreateIndex
CREATE INDEX "CompanyAssessment_companyId_idx" ON "CompanyAssessment"("companyId");

-- CreateIndex
CREATE INDEX "CompanyAssessment_programId_idx" ON "CompanyAssessment"("programId");

-- CreateIndex
CREATE INDEX "CompanyAssessment_programId_eligible_idx" ON "CompanyAssessment"("programId", "eligible");

-- CreateIndex
CREATE INDEX "AssessmentAnswer_assessmentId_idx" ON "AssessmentAnswer"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentAnswer_questionId_idx" ON "AssessmentAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionTemplate_slug_key" ON "ExtractionTemplate"("slug");

-- CreateIndex
CREATE INDEX "ExtractionTemplate_vatNumber_status_idx" ON "ExtractionTemplate"("vatNumber", "status");

-- CreateIndex
CREATE INDEX "TemplateField_templateId_idx" ON "TemplateField"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateField_templateId_key_key" ON "TemplateField"("templateId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateMapping_templateId_name_key" ON "TemplateMapping"("templateId", "name");

-- CreateIndex
CREATE INDEX "TemplateCondition_templateId_order_idx" ON "TemplateCondition"("templateId", "order");

-- CreateIndex
CREATE INDEX "TemplateRun_documentId_idx" ON "TemplateRun"("documentId");

-- CreateIndex
CREATE INDEX "TemplateRun_documentId_createdAt_idx" ON "TemplateRun"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "TemplateRun_templateId_createdAt_idx" ON "TemplateRun"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "TemplateSample_templateId_idx" ON "TemplateSample"("templateId");

-- CreateIndex
CREATE INDEX "TemplateJob_status_createdAt_idx" ON "TemplateJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TemplateJob_templateId_createdAt_idx" ON "TemplateJob"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "TemplateJobItem_jobId_order_idx" ON "TemplateJobItem"("jobId", "order");

-- CreateIndex
CREATE INDEX "TemplateJobItem_status_idx" ON "TemplateJobItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneExpense_expn_key" ON "SoftoneExpense"("expn");

-- CreateIndex
CREATE INDEX "SoftoneExpense_name_idx" ON "SoftoneExpense"("name");

-- CreateIndex
CREATE INDEX "SoftoneExpense_code_idx" ON "SoftoneExpense"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneLineItem_mtrl_key" ON "SoftoneLineItem"("mtrl");

-- CreateIndex
CREATE INDEX "SoftoneLineItem_name_idx" ON "SoftoneLineItem"("name");

-- CreateIndex
CREATE INDEX "SoftoneLineItem_code_idx" ON "SoftoneLineItem"("code");

-- CreateIndex
CREATE INDEX "SoftoneLineItem_mtrCategory_idx" ON "SoftoneLineItem"("mtrCategory");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneAccount_acnt_key" ON "SoftoneAccount"("acnt");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneAccount_code_key" ON "SoftoneAccount"("code");

-- CreateIndex
CREATE INDEX "SoftoneAccount_parentCode_idx" ON "SoftoneAccount"("parentCode");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneSxAccount_mtrl_key" ON "SoftoneSxAccount"("mtrl");

-- CreateIndex
CREATE INDEX "SoftoneSxAccount_name_idx" ON "SoftoneSxAccount"("name");

-- CreateIndex
CREATE INDEX "SoftoneSxAccount_code_idx" ON "SoftoneSxAccount"("code");

-- CreateIndex
CREATE INDEX "SoftoneSxAccount_mtrType_idx" ON "SoftoneSxAccount"("mtrType");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneLineCategory_mtrCategory_key" ON "SoftoneLineCategory"("mtrCategory");

-- CreateIndex
CREATE INDEX "SoftoneLineCategory_name_idx" ON "SoftoneLineCategory"("name");

-- CreateIndex
CREATE INDEX "SoftoneLineCategory_code_idx" ON "SoftoneLineCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneCostCenter_costcntr_key" ON "SoftoneCostCenter"("costcntr");

-- CreateIndex
CREATE INDEX "SoftoneCostCenter_name_idx" ON "SoftoneCostCenter"("name");

-- CreateIndex
CREATE INDEX "SoftoneCostCenter_code_idx" ON "SoftoneCostCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneProject_prjc_key" ON "SoftoneProject"("prjc");

-- CreateIndex
CREATE INDEX "SoftoneProject_name_idx" ON "SoftoneProject"("name");

-- CreateIndex
CREATE INDEX "SoftoneProject_code_idx" ON "SoftoneProject"("code");

-- CreateIndex
CREATE INDEX "SoftoneProject_trdr_idx" ON "SoftoneProject"("trdr");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneProjectStage_prjcStage_key" ON "SoftoneProjectStage"("prjcStage");

-- CreateIndex
CREATE INDEX "SoftoneProjectStage_name_idx" ON "SoftoneProjectStage"("name");

-- CreateIndex
CREATE INDEX "SoftoneProjectStage_code_idx" ON "SoftoneProjectStage"("code");

-- CreateIndex
CREATE INDEX "SoftoneMyDataClassType_name_idx" ON "SoftoneMyDataClassType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneMyDataClassType_sotype_code_key" ON "SoftoneMyDataClassType"("sotype", "code");

-- CreateIndex
CREATE INDEX "SoftoneMyDataClassCategory_name_idx" ON "SoftoneMyDataClassCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneMyDataClassCategory_sotype_code_key" ON "SoftoneMyDataClassCategory"("sotype", "code");

-- CreateIndex
CREATE INDEX "AllocationShapeRule_pattern_idx" ON "AllocationShapeRule"("pattern");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationShapeRule_afm_pattern_kind_key" ON "AllocationShapeRule"("afm", "pattern", "kind");

-- CreateIndex
CREATE INDEX "LineMatchRule_pattern_idx" ON "LineMatchRule"("pattern");

-- CreateIndex
CREATE UNIQUE INDEX "LineMatchRule_afm_pattern_key" ON "LineMatchRule"("afm", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "GeocodeCache_key_key" ON "GeocodeCache"("key");

-- CreateIndex
CREATE INDEX "GeocodeCache_usedAt_idx" ON "GeocodeCache"("usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneOutbox_idempotencyKey_key" ON "SoftoneOutbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SoftoneOutbox_status_createdAt_idx" ON "SoftoneOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SoftoneOutbox_tenantKey_idx" ON "SoftoneOutbox"("tenantKey");

-- CreateIndex
CREATE INDEX "SoftoneMirrorState_tenantKey_idx" ON "SoftoneMirrorState"("tenantKey");

-- CreateIndex
CREATE INDEX "SoftoneConnectionEvent_at_idx" ON "SoftoneConnectionEvent"("at");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAnswer_questionKey_key" ON "AccountingAnswer"("questionKey");

-- CreateIndex
CREATE INDEX "IntegratorItem_status_idx" ON "IntegratorItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SoftoneAsset_mtrl_key" ON "SoftoneAsset"("mtrl");

-- CreateIndex
CREATE INDEX "SoftoneAsset_name_idx" ON "SoftoneAsset"("name");

-- CreateIndex
CREATE INDEX "SoftoneAsset_code_idx" ON "SoftoneAsset"("code");

-- CreateIndex
CREATE INDEX "VatCheck_vat_createdAt_idx" ON "VatCheck"("vat", "createdAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpToken" ADD CONSTRAINT "OtpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MediaFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFile" ADD CONSTRAINT "MediaFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_legalTypeId_fkey" FOREIGN KEY ("legalTypeId") REFERENCES "LegalType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_businessTypeId_fkey" FOREIGN KEY ("businessTypeId") REFERENCES "BusinessType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_gemiOfficeId_fkey" FOREIGN KEY ("gemiOfficeId") REFERENCES "GemiOfficeRef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_companyStatusId_fkey" FOREIGN KEY ("companyStatusId") REFERENCES "CompanyStatusRef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_prefectureId_fkey" FOREIGN KEY ("prefectureId") REFERENCES "Prefecture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_vatCategoryId_fkey" FOREIGN KEY ("vatCategoryId") REFERENCES "VatCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Municipality" ADD CONSTRAINT "Municipality_prefectureId_fkey" FOREIGN KEY ("prefectureId") REFERENCES "Prefecture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_parentCode_fkey" FOREIGN KEY ("parentCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDocument" ADD CONSTRAINT "CompanyDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KadCode" ADD CONSTRAINT "KadCode_parentCode_fkey" FOREIGN KEY ("parentCode") REFERENCES "KadCode"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerKAD" ADD CONSTRAINT "CustomerKAD_resolvedKAD_fkey" FOREIGN KEY ("resolvedKAD") REFERENCES "KadCode"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KadLicenseRequirement" ADD CONSTRAINT "KadLicenseRequirement_code_fkey" FOREIGN KEY ("code") REFERENCES "KadCode"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyActivity" ADD CONSTRAINT "CompanyActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyChannel" ADD CONSTRAINT "CompanyChannel_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBranch" ADD CONSTRAINT "CompanyBranch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBranch" ADD CONSTRAINT "CompanyBranch_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "Region"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTypeAssignment" ADD CONSTRAINT "CompanyTypeAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTypeAssignment" ADD CONSTRAINT "CompanyTypeAssignment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "CompanyType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcelImport" ADD CONSTRAINT "ExcelImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrDocument" ADD CONSTRAINT "OcrDocument_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "OcrBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrDocument" ADD CONSTRAINT "OcrDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrDocument" ADD CONSTRAINT "OcrDocument_taxTemplateId_fkey" FOREIGN KEY ("taxTemplateId") REFERENCES "TaxFormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramKad" ADD CONSTRAINT "ProgramKad_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExpenseCategory" ADD CONSTRAINT "ProgramExpenseCategory_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramBonus" ADD CONSTRAINT "ProgramBonus_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFile" ADD CONSTRAINT "ProgramFile_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramEligibleLegalForm" ADD CONSTRAINT "ProgramEligibleLegalForm_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRegion" ADD CONSTRAINT "ProgramRegion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCriterion" ADD CONSTRAINT "ProgramCriterion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDeadline" ADD CONSTRAINT "ProgramDeadline_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPhase" ADD CONSTRAINT "ProgramPhase_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPhase" ADD CONSTRAINT "ProgramPhase_phaseTemplateId_fkey" FOREIGN KEY ("phaseTemplateId") REFERENCES "PhaseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseDocumentRequirement" ADD CONSTRAINT "PhaseDocumentRequirement_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "ProgramPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhaseDocumentRequirement" ADD CONSTRAINT "PhaseDocumentRequirement_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementBusinessType" ADD CONSTRAINT "RequirementBusinessType_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "PhaseDocumentRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementBusinessType" ADD CONSTRAINT "RequirementBusinessType_businessTypeId_fkey" FOREIGN KEY ("businessTypeId") REFERENCES "BusinessType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrInvoiceItem" ADD CONSTRAINT "OcrInvoiceItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OcrDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrInvoiceItemAllocation" ADD CONSTRAINT "OcrInvoiceItemAllocation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "OcrInvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxFormTemplateField" ADD CONSTRAINT "TaxFormTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaxFormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFinancialValue" ADD CONSTRAINT "CompanyFinancialValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRequiredField" ADD CONSTRAINT "ProgramRequiredField_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramRequiredField" ADD CONSTRAINT "ProgramRequiredField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TaxFormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramQuestionnaire" ADD CONSTRAINT "ProgramQuestionnaire_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramQuestion" ADD CONSTRAINT "ProgramQuestion_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "ProgramQuestionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramQuestionOption" ADD CONSTRAINT "ProgramQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ProgramQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAssessment" ADD CONSTRAINT "CompanyAssessment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAssessment" ADD CONSTRAINT "CompanyAssessment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAssessment" ADD CONSTRAINT "CompanyAssessment_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "ProgramQuestionnaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "CompanyAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAnswer" ADD CONSTRAINT "AssessmentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ProgramQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateField" ADD CONSTRAINT "TemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExtractionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateMapping" ADD CONSTRAINT "TemplateMapping_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExtractionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateCondition" ADD CONSTRAINT "TemplateCondition_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExtractionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRun" ADD CONSTRAINT "TemplateRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExtractionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRun" ADD CONSTRAINT "TemplateRun_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OcrDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSample" ADD CONSTRAINT "TemplateSample_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExtractionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateJob" ADD CONSTRAINT "TemplateJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExtractionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateJobItem" ADD CONSTRAINT "TemplateJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TemplateJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
