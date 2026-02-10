import { motion } from "framer-motion";
import type React from "react";
import { contentFadeVariants, transitions } from "../../lib/animations";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  hint?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  hint,
}: EmptyStateProps) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 text-base-content/50"
      variants={contentFadeVariants}
      initial="initial"
      animate="animate"
      transition={transitions.normal}
    >
      {icon && (
        <motion.div
          className="mb-4 text-4xl opacity-40"
          animate={{ y: [0, -6, 0] }}
          transition={{
            duration: 3,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
        >
          {icon}
        </motion.div>
      )}
      <h3 className="font-semibold text-lg">{title}</h3>
      {description && <p className="mt-1 text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
      {hint && (
        <p className="mt-6 text-[10px] text-base-content/30">
          <i className="fa-regular fa-lightbulb mr-1" />
          {hint}
        </p>
      )}
    </motion.div>
  );
}
