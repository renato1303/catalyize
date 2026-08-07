import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, BarChart3, Binary, Compass, Cpu, Info } from 'lucide-react';

interface LoaderProps {
  onComplete: () => void;
}

export default function LoaderStep({ onComplete }: LoaderProps) {
  const steps = [
    { text: 'Avaliando cenário da empresa...', icon: Cpu, progressRange: [0, 25], color: 'text-sky-600' },
    { text: 'Identificando gargalos de crescimento...', icon: BarChart3, progressRange: [25, 55], color: 'text-teal-600' },
    { text: 'Cruzando informações da operação...', icon: Compass, progressRange: [55, 85], color: 'text-sky-600' },
    { text: 'Finalizando e redirecionando para a página de obrigado...', icon: ShieldCheck, progressRange: [85, 100], color: 'text-teal-600' },
  ];

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // We want the total duration to be exactly 2000ms
    const totalDuration = 2100; // slightly above 2s to allow final rendering
    const intervalTime = 30; // ms
    const totalSteps = totalDuration / intervalTime;
    let stepCount = 0;

    const timer = setInterval(() => {
      stepCount++;
      const currentProgress = Math.min(Math.round((stepCount / totalSteps) * 100), 100);
      setProgress(currentProgress);

      // Map progress to steps indices
      if (currentProgress < 25) {
        setCurrentStepIndex(0);
      } else if (currentProgress < 55) {
        setCurrentStepIndex(1);
      } else if (currentProgress < 85) {
        setCurrentStepIndex(2);
      } else {
        setCurrentStepIndex(3);
      }

      if (currentProgress >= 100) {
        clearInterval(timer);
        // Wait minor delay and trigger complete
        setTimeout(() => {
          onComplete();
        }, 300);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [onComplete]);

  const CurrentIcon = steps[currentStepIndex].icon;

  return (
    <div className="flex flex-col items-center justify-center min-h-[450px] w-full max-w-2xl glass-panel bg-white/95 border border-slate-200/90 rounded-[32px] p-8 md:p-12 shadow-2xl relative overflow-hidden text-slate-900 select-none">
      <div className="relative flex items-center justify-center mb-8 w-40 h-40">
        
        {/* Animated Background Radar Wave */}
        <div className="absolute inset-0 border border-teal-500/20 rounded-full animate-ping pointer-events-none" />
        <div className="absolute inset-10 border border-sky-500/20 rounded-full animate-pulse pointer-events-none" />

        {/* Dynamic Glowing Arc Progress Bar */}
        <svg className="absolute w-full h-full transform -rotate-90">
          <circle
            cx="80"
            cy="80"
            r="70"
            className="stroke-slate-200 fill-none"
            strokeWidth="4"
          />
          <motion.circle
            cx="80"
            cy="80"
            r="70"
            className="stroke-teal-600 fill-none"
            strokeWidth="4"
            strokeDasharray={439.8} // 2 * pi * 70
            strokeDashoffset={439.8 - (439.8 * progress) / 100}
            transition={{ ease: 'easeOut' }}
          />
        </svg>

        {/* Core Percentage and Icon */}
        <div className="absolute flex flex-col items-center justify-center">
          <motion.div
            key={currentStepIndex}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className={`mb-1 ${steps[currentStepIndex].color}`}
          >
            <CurrentIcon className="w-8 h-8" />
          </motion.div>
          <span className="font-display font-bold text-3xl tracking-tight text-slate-900 mb-0.5">
            {progress}%
          </span>
          <span className="text-[10px] tracking-widest text-sky-600 font-mono font-medium uppercase">
            CALIBRANDO
          </span>
        </div>
      </div>

      {/* Steps text animation */}
      <div className="h-10 text-center w-full max-w-md px-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={currentStepIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="text-base md:text-lg font-display text-slate-800 tracking-wide font-medium"
          >
            {steps[currentStepIndex].text}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Bottom Loading Bar */}
      <div className="w-64 h-2 bg-slate-100 rounded-full overflow-hidden mt-6 border border-slate-200">
        <div 
          className="h-full bg-gradient-to-r from-sky-600 to-teal-600 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

    </div>
  );
}

