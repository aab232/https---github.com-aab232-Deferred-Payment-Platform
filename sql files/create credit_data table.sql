CREATE TABLE `credit_data` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `employment_status` ENUM(
    'Employed', 
    'Self-Employed',
    'Unemployed',  
    'Student',
    'Retired',
    'Other'
    ) DEFAULT NULL, 
  `person_income` INT DEFAULT NULL, 
  `credit_utilization_ratio` DECIMAL (10,2) DEFAULT NULL, -- how much of the credit is used up
  `payment_history` DECIMAL DEFAULT NULL, -- amount of money paid back
  `loan_term` INT DEFAULT NULL, -- length of loan term
  `loan_amnt` INT DEFAULT NULL,  -- credit loan amount
  `loan_percent_income` DECIMAL (10,2) DEFAULT NULL, -- loan to income percentage
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),                     
  KEY `idx_user_id` (`user_id`),          
  KEY `idx_user_recorded_at` (`user_id`, `recorded_at`),

  CONSTRAINT `fk_credit_data_user_id`    
    FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)     
    ON DELETE CASCADE                     
    ON UPDATE CASCADE                     
);