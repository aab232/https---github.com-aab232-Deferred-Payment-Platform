CREATE TABLE IF NOT EXISTS `credit_assessments` (
  `assessment_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,  -- foreign key linking to the users table
  `assessment_timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- when the assessment was performed
  `risk_score` FLOAT NULL, -- ML model output score (0-1)
  `credit_tier` INT NULL, -- derived tier based on score (1-7, 7 being highest risk)
  `credit_limit` DECIMAL(10, 2) NULL, -- assigned credit limit based on tiers
  `calculated_terms` JSON NULL, -- applicable term lengths (3, 6 , 12, etc.)
  
  PRIMARY KEY (`assessment_id`),
  INDEX `idx_assessment_user_ts` (`user_id`, `assessment_timestamp`), -- fetching latest assessment
  CONSTRAINT `fk_assessment_user_id`

    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`user_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);
