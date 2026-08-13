# Preregistered uncertainty reporting

The corpus is a bounded feasibility instrument, not a prevalence sample. Its 3 positive and 13 negative pairs cannot estimate production error rates precisely.

For every reviewer and condition, report the exact confusion counts, correct count out of 16, abstention count, precision, F1, sensitivity (correct `SAME_ROOT` out of 3), specificity (correct `DIFFERENT_ROOT` out of 13), and accuracy. Report two-sided 95% Wilson intervals for sensitivity, specificity, accuracy, inter-reviewer pair agreement, and Condition A exact item-label agreement.

Wilson intervals are descriptive and never alter the exact-count gate. Do not substitute normal intervals, resampling intervals, posterior probabilities, or rounded percentage comparisons.

Model confidence is self-report, not calibrated probability evidence. Report item-confidence count, mean, median, and fixed bins `[0,0.5)`, `[0.5,0.7)`, `[0.7,0.85)`, and `[0.85,1]`. For Condition B binary pair decisions, additionally report Brier score against correctness. Exclude `AMBIGUOUS` decisions from the Brier score and report the excluded count separately. Do not derive pair confidence from Condition A item confidence.

For every reviewer and condition, emit `failurePairIds` for incorrect binary decisions and `abstentionPairIds` for `AMBIGUOUS` decisions; the two lists are disjoint. Also emit numeric `accuracy` and integer `abstentions` in each pair score. Do not expose gold rationales in reviewer prompts or raw-output directories. No confidence threshold, interval bound, or calibration statistic changes the preregistered conclusion.
