import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { Event } from './Event';

@Entity('participants')
export class Participant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  idNumber: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'date' })
  dateOfBirth: Date;

  @Column({ type: 'varchar', length: 20 })
  sex: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  county: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  constituency: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ward: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pollingCenter: string | null;

  @Column({ type: 'smallint', default: 0 })
  checkedIn: number; // 1 for checked in, 0 for not checked in

  @Column({ type: 'uuid' })
  checkedInById: string;

  @ManyToOne(() => User, (user) => user.participants)
  @JoinColumn({ name: 'checkedInById' })
  checkedInBy: User;

  @Column({ type: 'uuid' })
  eventId: string;

  @ManyToOne(() => Event, (event) => event.participants)
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column({ type: 'timestamp', nullable: true })
  checkedInAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

