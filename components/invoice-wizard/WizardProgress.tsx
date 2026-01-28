"use client";

import { Check, User, Package, FileCheck } from "lucide-react";

interface WizardProgressProps {
  currentStep: 1 | 2 | 3;
  clientSelected: boolean;
  servicesSelected: boolean;
}

const steps = [
  { number: 1, label: "Client", icon: User },
  { number: 2, label: "Services", icon: Package },
  { number: 3, label: "Review", icon: FileCheck },
];

export function WizardProgress({
  currentStep,
  clientSelected,
  servicesSelected,
}: WizardProgressProps) {
  const getStepStatus = (stepNumber: number) => {
    if (stepNumber < currentStep) return "completed";
    if (stepNumber === currentStep) return "active";
    return "upcoming";
  };

  const isStepEnabled = (stepNumber: number) => {
    if (stepNumber === 1) return true;
    if (stepNumber === 2) return clientSelected;
    if (stepNumber === 3) return clientSelected && servicesSelected;
    return false;
  };

  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => {
        const status = getStepStatus(step.number);
        const enabled = isStepEnabled(step.number);
        const Icon = step.icon;

        return (
          <div key={step.number} className="flex items-center">
            {/* Step circle */}
            <div className="wizard-step">
              <div
                className={`wizard-step-circle ${status} ${
                  !enabled ? "opacity-50" : ""
                }`}
              >
                {status === "completed" ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  status === "active"
                    ? "text-content"
                    : status === "completed"
                    ? "text-success"
                    : "text-content-muted"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={`wizard-connector mx-4 ${
                  getStepStatus(step.number + 1) !== "upcoming" ? "completed" : ""
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default WizardProgress;
