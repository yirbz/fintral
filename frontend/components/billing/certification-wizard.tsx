"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  Upload, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Building, 
  FileText, 
  ShieldCheck,
  Loader2,
  FileCode
} from "lucide-react";
import { toast } from "sonner";
import { billingApi, VerificationStatus } from "@/lib/api/billing";
import { 
  provinceAll, 
  municipalitiesByProvince, 
  type Province, 
  type Municipalities 
} from "geo-rd";
import { dgiiService } from "@/lib/services/dgii";
import { consultRncAction } from "@/app/actions/dgii";

interface CertificationWizardProps {
  initialStatus: VerificationStatus;
  onComplete: () => void;
}

const ECONOMIC_ACTIVITIES = [
  { value: "Servicios de Software / TI", label: "Servicios de Software y Tecnología" },
  { value: "Servicios Profesionales / Consultoría", label: "Servicios Profesionales y Consultoría" },
  { value: "Comercio al por menor (Retail)", label: "Comercio al por menor" },
  { value: "Comercio al por mayor", label: "Comercio al por mayor" },
  { value: "Servicios de Salud", label: "Servicios de Salud" },
  { value: "Construcción y Bienes Raíces", label: "Construcción y Bienes Raíces" },
  { value: "Educación", label: "Educación" },
  { value: "Manufactura e Industria", label: "Manufactura e Industria" },
  { value: "Transporte y Logística", label: "Transporte y Logística" },
  { value: "Turismo y Hostelería", label: "Turismo y Hostelería" },
  { value: "Otra", label: "Otra Actividad Económica" }
];

export function CertificationWizard({ initialStatus, onComplete }: CertificationWizardProps) {
  // Determine starting step based on certification_status
  const getStartingStep = (statusStr: string) => {
    switch (statusStr) {
      case "company_registered":
        return 2;
      case "certificate_uploaded":
        return 3;
      case "set_test_running":
        return 3;
      case "set_test_approved":
      case "certified":
        return 4;
      default:
        return 1;
    }
  };

  const [step, setStep] = useState<number>(() => getStartingStep(initialStatus.certification_status));
  const [loading, setLoading] = useState<boolean>(false);

  // Step 1: Company details state
  const [rnc, setRnc] = useState<string>(initialStatus.tax_id || "");
  const [businessName, setBusinessName] = useState<string>(initialStatus.name || "");
  const [tradeName, setTradeName] = useState<string>("");
  const [economicActivity, setEconomicActivity] = useState<string>(initialStatus.economic_activity || "");
  const [customActivity, setCustomActivity] = useState<string>("");
  const [fiscalAddress, setFiscalAddress] = useState<string>(initialStatus.fiscal_address || "");
  
  // DR geographic data state
  const [provinceCode, setProvinceCode] = useState<string>("");
  const [province, setProvince] = useState<string>("");
  const [municipality, setMunicipality] = useState<string>("");
  const [provincesList] = useState<Province[]>(() => provinceAll());
  const [municipalitiesList, setMunicipalitiesList] = useState<Municipalities[]>([]);

  useEffect(() => {
    if (provinceCode) {
      setMunicipalitiesList(municipalitiesByProvince(provinceCode));
    } else {
      setMunicipalitiesList([]);
    }
  }, [provinceCode]);

  const [verifyingRnc, setVerifyingRnc] = useState<boolean>(false);

  useEffect(() => {
    const clean = dgiiService.cleanRNC(rnc);
    if (dgiiService.isValidRNC(clean)) {
      const fetchDgiiData = async () => {
        setVerifyingRnc(true);
        try {
          const data = await consultRncAction(clean);
          if (data) {
            if (data.name && !businessName) {
              setBusinessName(data.name);
            }
            if (data.tradeName && !tradeName) {
              setTradeName(data.tradeName);
            }
            if (data.economicActivity && !economicActivity) {
              const activityVal = data.economicActivity;
              const matches = ECONOMIC_ACTIVITIES.some(act => act.value === activityVal);
              if (matches) {
                setEconomicActivity(activityVal);
              } else {
                setEconomicActivity("Otra");
                setCustomActivity(activityVal);
              }
            }
            toast.success("Datos de la empresa auto-completados desde DGII");
          }
        } catch (err) {
          console.error("Error auto-completing DGII data:", err);
        } finally {
          setVerifyingRnc(false);
        }
      };
      if (!businessName) {
        fetchDgiiData();
      }
    }
  }, [rnc, businessName, tradeName, economicActivity]);

  // Step 2: Certificate state
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePassword, setCertificatePassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Test status state
  const [testTrackId, setTestTrackId] = useState<string>("");
  const [testStatus, setTestStatus] = useState<"IDLE" | "PROCESSING" | "COMPLETED" | "FAILED">(() => {
    return initialStatus.certification_status === "set_test_running" ? "PROCESSING" : "IDLE";
  });
  const [testResult, setTestResult] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [testDetails, setTestDetails] = useState<any>(null);

  // Auto-poll if step is 3 and testStatus is PROCESSING
  useEffect(() => {
    let intervalId: any;
    if (step === 3 && testStatus === "PROCESSING") {
      const pollStatus = async () => {
        try {
          const res = await billingApi.checkSetTestStatus();
          if (res.status === "COMPLETED") {
            setTestStatus("COMPLETED");
            setTestResult(res.result || "APPROVED");
            setTestDetails(res.details);
            if (res.result === "APPROVED") {
              toast.success("¡Pruebas de certificación aprobadas por la DGII!");
              setTimeout(() => {
                setStep(4);
              }, 1500);
            } else {
              toast.error("El set de pruebas fue rechazado por la DGII.");
            }
          } else if (res.status === "FAILED") {
            setTestStatus("FAILED");
            setTestResult("REJECTED");
            setTestDetails(res.details);
            toast.error("El set de pruebas falló. Revisa los detalles.");
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };

      // Poll immediately and then every 10 seconds
      pollStatus();
      intervalId = setInterval(pollStatus, 10000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [step, testStatus]);

  // Form validations for Step 1
  const validateStep1 = () => {
    const cleanRnc = dgiiService.cleanRNC(rnc);
    if (!dgiiService.isValidRNC(cleanRnc)) {
      toast.error("El RNC / Cédula ingresado es inválido.");
      return false;
    }
    if (!businessName.trim()) {
      toast.error("La Razón Social es requerida.");
      return false;
    }
    if (!economicActivity) {
      toast.error("Selecciona una Actividad Económica.");
      return false;
    }
    if (economicActivity === "Otra" && !customActivity.trim()) {
      toast.error("Especifica tu actividad económica.");
      return false;
    }
    if (!fiscalAddress.trim()) {
      toast.error("La dirección fiscal del establecimiento es requerida.");
      return false;
    }
    if (!province.trim()) {
      toast.error("La provincia es requerida.");
      return false;
    }
    if (!municipality.trim()) {
      toast.error("El municipio es requerido.");
      return false;
    }
    return true;
  };

  const handleRegisterCompany = async () => {
    if (!validateStep1()) return;
    // Just advance to Step 2 to upload the certificate, as Alanube requires both together.
    setStep(2);
  };

  // Drag & drop handlers for Step 2
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".p12") || file.name.endsWith(".pfx")) {
        setCertificateFile(file);
      } else {
        toast.error("Por favor, sube un archivo con extensión .p12 o .pfx");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith(".p12") || file.name.endsWith(".pfx")) {
        setCertificateFile(file);
      } else {
        toast.error("El archivo debe ser .p12 o .pfx");
      }
    }
  };

  const handleUploadCertificate = async () => {
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!certificateFile) {
      toast.error("Por favor selecciona un archivo de certificado (.p12/.pfx).");
      return;
    }
    if (!certificatePassword) {
      toast.error("Por favor introduce la contraseña del certificado.");
      return;
    }

    setLoading(true);
    try {
      const finalActivity = economicActivity === "Otra" ? customActivity : economicActivity;
      const formData = new FormData();
      formData.append("rnc", rnc.replace(/[^0-9]/g, ""));
      formData.append("business_name", businessName);
      formData.append("trade_name", tradeName || businessName);
      formData.append("economic_activity", finalActivity);
      formData.append("branch_office_address", fiscalAddress);
      formData.append("province", province);
      formData.append("municipality", municipality);
      formData.append("certificate", certificateFile);
      formData.append("certificate_password", certificatePassword);

      await billingApi.registerCompany(formData);
      toast.success("Empresa y certificado digital registrados exitosamente.");
      setStep(3);
    } catch (err: any) {
      toast.error("Error al registrar la empresa: " + (err.message || "Verifica el archivo o la contraseña"));
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Trigger set test
  const handleStartSetTest = async () => {
    setLoading(true);
    try {
      const res = await billingApi.startSetTest();
      setTestTrackId(res.track_id);
      setTestStatus("PROCESSING");
      toast.success("Set de pruebas iniciado ante la DGII.");
    } catch (err: any) {
      toast.error("Error al iniciar pruebas: " + (err.message || "Error del servidor"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Sleek Step Indicator */}
      <div className="flex items-center justify-between px-4">
        {[
          { num: 1, label: "Empresa" },
          { num: 2, label: "Certificado" },
          { num: 3, label: "Pruebas DGII" },
          { num: 4, label: "Completado" }
        ].map((s, idx, arr) => (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div 
                className={`size-6 rounded-full flex items-center justify-center text-[11px] font-semibold border transition-all ${
                  step > s.num 
                    ? "bg-emerald-500 border-emerald-500 text-white" 
                    : step === s.num 
                      ? "bg-primary border-primary text-primary-foreground font-bold shadow-xs shadow-primary/30" 
                      : "bg-background border-border text-muted-foreground"
                }`}
              >
                {step > s.num ? <Check className="size-3.5 stroke-[3]" /> : s.num}
              </div>
              <span className={`text-[11px] font-medium hidden sm:inline ${step === s.num ? "text-foreground font-semibold" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
            {idx < arr.length - 1 && (
              <div 
                className={`h-0.5 mx-4 flex-1 rounded transition-colors ${
                  step > s.num ? "bg-emerald-500" : "bg-border"
                }`} 
              />
            )}
          </div>
        ))}
      </div>

      {/* Main Wizard Content Card */}
      <div className="bg-card border border-border/60 rounded-xl shadow-xs overflow-hidden">
        {step === 1 && (
          <div className="p-6 space-y-5 animate-fade-in">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Building className="size-4 text-primary" />
                Paso 1: Configurar Datos Fiscales de la Empresa
              </h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                Registra la información oficial de tu negocio para darla de alta en el sistema de facturación electrónica.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 relative">
                <label className="text-[11px] font-medium text-foreground flex items-center gap-1">
                  RNC / Cédula (sin guiones)
                  {initialStatus.tax_id && (
                    <Lock className="size-2.5 text-muted-foreground" />
                  )}
                </label>
                <input 
                  type="text" 
                  value={rnc}
                  onChange={(e) => setRnc(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="ej: 132109122"
                  disabled={!!initialStatus.tax_id}
                  className={`flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${
                    initialStatus.tax_id ? "bg-muted cursor-not-allowed opacity-80" : ""
                  }`}
                />
                {verifyingRnc && (
                  <p className="text-[9px] text-sky-500 flex items-center gap-1 animate-pulse absolute -bottom-4">
                    <Loader2 className="size-2.5 animate-spin" />
                    Consultando DGII...
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Razón Social</label>
                <input 
                  type="text" 
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="ej: Fintral SRL"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Nombre Comercial (Opcional)</label>
                <input 
                  type="text" 
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder="ej: Fintral Facturación"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Actividad Económica DGII</label>
                <select
                  value={economicActivity}
                  onChange={(e) => setEconomicActivity(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Seleccione una actividad</option>
                  {ECONOMIC_ACTIVITIES.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {economicActivity === "Otra" && (
                <div className="col-span-1 md:col-span-2 space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">Especificar Actividad Económica</label>
                  <input 
                    type="text" 
                    value={customActivity}
                    onChange={(e) => setCustomActivity(e.target.value)}
                    placeholder="ej: Venta de artículos artesanales"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              )}

              <div className="col-span-1 md:col-span-2 space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Dirección Fiscal del Establecimiento</label>
                <input 
                  type="text" 
                  value={fiscalAddress}
                  onChange={(e) => setFiscalAddress(e.target.value)}
                  placeholder="ej: Av. Winston Churchill #109, Santo Domingo"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Provincia</label>
                <select
                  value={provinceCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setProvinceCode(code);
                    const found = provincesList.find(p => p.Code === code);
                    setProvince(found ? found.Name : "");
                    setMunicipality(""); // Reset municipality on province change
                  }}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Seleccione una provincia</option>
                  {provincesList.map(p => (
                    <option key={p.Code} value={p.Code}>{p.Name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">Municipio</label>
                <select
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                  disabled={!provinceCode}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                >
                  <option value="">Seleccione un municipio</option>
                  {municipalitiesList.map(m => (
                    <option key={m.Code} value={m.Name}>{m.Name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-border/50">
              <button 
                onClick={handleRegisterCompany}
                disabled={loading}
                className="flex items-center gap-1 bg-primary text-primary-foreground font-medium px-4 h-8 rounded text-[11px] transition-colors disabled:opacity-50 hover:bg-primary/90"
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Siguiente Paso
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 space-y-5 animate-fade-in">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Lock className="size-4 text-primary" />
                Paso 2: Subir Certificado Digital (.p12 / .pfx)
              </h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                El certificado digital es tu firma electrónica que otorga validez legal a los e-CF emitidos ante la DGII.
              </p>
            </div>

            {/* Drag and Drop Zone */}
            <div 
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                dragActive 
                  ? "border-primary bg-primary/5" 
                  : certificateFile 
                    ? "border-emerald-500/30 bg-emerald-500/5" 
                    : "border-border/60 hover:bg-muted/30"
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".p12,.pfx"
                onChange={handleFileChange}
                className="hidden" 
              />
              {certificateFile ? (
                <>
                  <div className="size-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <FileCode className="size-5" />
                  </div>
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-500">{certificateFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(certificateFile.size / 1024).toFixed(1)} KB — Listo para verificar</p>
                </>
              ) : (
                <>
                  <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Upload className="size-5" />
                  </div>
                  <p className="text-[11px] font-semibold text-foreground">Arrastra tu certificado o haz click aquí</p>
                  <p className="text-[10px] text-muted-foreground">Archivos soportados: .p12 y .pfx (Máx. 5MB)</p>
                </>
              )}
            </div>

            {/* Password input */}
            <div className="space-y-1.5 max-w-sm">
              <label className="text-[11px] font-medium text-foreground">Contraseña del Certificado</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  value={certificatePassword}
                  onChange={(e) => setCertificatePassword(e.target.value)}
                  placeholder="Introduce la contraseña"
                  className="flex h-8 w-full rounded-md border border-input bg-background pl-3 pr-8 py-1 text-xs shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* Security note */}
            <div className="flex gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg text-[10px] text-amber-600 dark:text-amber-500 leading-relaxed">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <p>
                <strong>Nota de seguridad:</strong> Fintral no almacena tu certificado digital ni tu contraseña. El archivo se usa de forma efímera en memoria para firmar el documento de certificación inicial en Alanube y se descarta de inmediato.
              </p>
            </div>

            <div className="flex justify-between pt-3 border-t border-border/50">
              <button 
                onClick={() => setStep(1)}
                disabled={loading}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium px-3 h-8 rounded text-[11px] transition-colors"
              >
                <ChevronLeft className="size-3.5" />
                Atrás
              </button>
              <button 
                onClick={handleUploadCertificate}
                disabled={loading || !certificateFile || !certificatePassword}
                className="flex items-center gap-1 bg-primary text-primary-foreground font-medium px-4 h-8 rounded text-[11px] transition-colors disabled:opacity-50 hover:bg-primary/90"
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Verificar y Firmar
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="p-6 space-y-5 animate-fade-in">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="size-4 text-primary" />
                Paso 3: Pruebas Automáticas de la DGII
              </h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                La DGII exige una secuencia automatizada de comprobantes electrónicos para validar que los e-CF se firman y estructuran correctamente.
              </p>
            </div>

            {testStatus === "IDLE" ? (
              <div className="text-center py-6 space-y-4">
                <p className="text-xs text-foreground max-w-md mx-auto">
                  Tu certificado está listo. Presiona el botón para iniciar el set de pruebas automáticas. Alanube simulará la emisión de e-CF ante la DGII en ambiente de pruebas (TesteCF).
                </p>
                <button 
                  onClick={handleStartSetTest}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground font-medium px-5 h-9 rounded text-xs transition-colors mx-auto hover:bg-primary/90"
                >
                  {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Iniciar Set de Pruebas
                  <ChevronRight className="size-4" />
                </button>
              </div>
            ) : (
              <div className="border border-border/50 rounded-lg p-5 bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Estado de las pruebas</span>
                  {testStatus === "PROCESSING" && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                      <Loader2 className="size-3 animate-spin" />
                      Procesando...
                    </span>
                  )}
                  {testStatus === "COMPLETED" && testResult === "APPROVED" && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <Check className="size-3" />
                      Aprobadas
                    </span>
                  )}
                  {testStatus === "COMPLETED" && testResult === "REJECTED" && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                      <XCircle className="size-3" />
                      Rechazadas
                    </span>
                  )}
                  {testStatus === "FAILED" && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                      <XCircle className="size-3" />
                      Error
                    </span>
                  )}
                </div>

                {/* Progress details */}
                <div className="space-y-2">
                  <div className="h-1.5 w-full bg-border/50 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        testStatus === "COMPLETED" && testResult === "APPROVED" 
                          ? "bg-emerald-500 w-full" 
                          : testStatus === "PROCESSING" 
                            ? "bg-blue-500 w-2/3 animate-pulse" 
                            : "bg-red-500 w-full"
                      }`} 
                    />
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {testStatus === "PROCESSING" && "Alanube está enviando lotes de prueba de e-CF 31, 32 y 34 para su aceptación ante el validador fiscal de la DGII. Este proceso se completa en segundo plano."}
                    {testStatus === "COMPLETED" && testResult === "APPROVED" && "¡Felicitaciones! La DGII ha verificado con éxito el esquema de firma y contenido de tus facturas de prueba."}
                    {testStatus === "COMPLETED" && testResult === "REJECTED" && "El validador fiscal de la DGII rechazó algunos de los documentos enviados debido a inconsistencias. Consulta el log o reintenta."}
                    {testStatus === "FAILED" && "Ocurrió un error inesperado al conectar con el servidor de la DGII. Intenta de nuevo."}
                  </p>
                </div>

                {/* Logs / Details if failed */}
                {(testStatus === "COMPLETED" && testResult === "REJECTED" || testStatus === "FAILED") && (
                  <div className="flex justify-end pt-2">
                    <button 
                      onClick={() => setTestStatus("IDLE")}
                      className="bg-red-500 hover:bg-red-600 text-white font-medium px-4 h-7 rounded text-[11px] transition-colors"
                    >
                      Reintentar Set de Pruebas
                    </button>
                  </div>
                )}
              </div>
            )}

            {testStatus === "IDLE" && (
              <div className="flex justify-start pt-3 border-t border-border/50">
                <button 
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium px-3 h-8 rounded text-[11px] transition-colors"
                >
                  <ChevronLeft className="size-3.5" />
                  Atrás
                </button>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="p-8 text-center space-y-6 animate-fade-in">
            {/* CSS Celebration confetti effect */}
            <div className="relative inline-block mx-auto">
              <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/15">
                <ShieldCheck className="size-8" />
              </div>
              <span className="absolute -top-1 -right-1 flex size-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full size-3 bg-emerald-500"></span>
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-base font-bold text-foreground">¡Tu empresa ha sido certificada!</h2>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Fintral se ha conectado exitosamente con Alanube y la DGII. Las secuencias de comprobante electrónico (e-CF) han sido desbloqueadas para tu organización.
              </p>
            </div>

            {/* Certification metadata box */}
            <div className="border border-border/60 rounded-lg p-4 bg-muted/20 text-left text-xs max-w-sm mx-auto space-y-2.5">
              <div className="flex justify-between border-b border-border/40 pb-1.5">
                <span className="text-muted-foreground">RNC</span>
                <span className="font-semibold">{rnc}</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-1.5">
                <span className="text-muted-foreground">Razón Social</span>
                <span className="font-semibold truncate max-w-[200px]">{businessName}</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-1.5">
                <span className="text-muted-foreground">Ambiente Fiscal</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-500 flex items-center gap-1">
                  Certificación (TesteCF)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha</span>
                <span className="font-semibold">{new Date().toLocaleDateString("es-DO")}</span>
              </div>
            </div>

            <div className="pt-2">
              <button 
                onClick={onComplete}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 h-9 rounded text-xs transition-colors shadow-sm"
              >
                Comenzar Facturación Electrónica
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
